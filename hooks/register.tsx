// agent-panel: panel lateral que enseña en tiempo real los agentes y subagentes de la sesión.
//
// De dónde sale cada dato (comprobado en los tipos del motor, claude-code.d.ts):
// - Nombre: evento `agent.spawn`, campo `name` (el que dio la llamada Agent) o, si no hay,
//   `subagentType` (general-purpose, Explore, el nombre de un agente de .claude/agents...).
// - Modelo: el evento `agent.spawn` solo trae el que pidió la llamada (`model`, puede faltar).
//   El modelo de verdad lo devuelve `next(e)`: `{ model, agentId }`, ya resuelto por el motor
//   (el de la llamada, si no el de la definición del agente, si no el del padre).
//   Para la conversación principal, `$.session.model()`.
// - Qué hace: evento `tool.call`, que trae `agentId` (ausente en la conversación principal).
// - Estado: `turn.start` y `turn.complete`, que también traen `agentId`.
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Estado, FilaAgente } from '../types'

const PANE = 'agent-panel'
const TITULO = 'Agentes'
const PRINCIPAL = 'principal'
const MAX_FILAS = 30
// Ancho pedido para el panel acoplado, en columnas. Es una petición:
// si arrastras el borde del panel, gana tu ancho.
const ANCHO = 45
const ABRIR = { id: PANE, title: TITULO, columns: ANCHO }

// Lista de agentes. La etiqueta `shape` descarta lo guardado por una versión con otros campos.
const agentes = atom({ plugin: 'agent-panel', key: 'agentes' } as const, [], { shape: 'agentes-1' })

// Color de cada estado (claves del tema del terminal).
const COLOR: Record<Estado, 'warning' | 'suggestion' | 'success' | 'error'> = {
  trabajando: 'warning',
  esperando: 'suggestion',
  terminado: 'success',
  fallido: 'error',
}

// ¿Hay alguien trabajando? Solo entonces el reloj redibuja el tiempo cada segundo.
let hayTrabajando = false

/** Cambia la fila `id` (si existe) y recuerda si queda alguien trabajando. */
function cambiarFila(lista: FilaAgente[], id: string, cambio: Partial<FilaAgente>): FilaAgente[] {
  const nueva = lista.map(f => (f.id === id ? { ...f, ...cambio } : f))
  hayTrabajando = nueva.some(f => f.estado === 'trabajando')
  return nueva
}

/** Último trozo de una ruta: «C:\a\b\cocina.py» → «cocina.py». */
function nombreArchivo(ruta: string): string {
  return ruta.split(/[\\/]/).pop() ?? ruta
}

/** Recorta un texto largo para que quepa en una línea del panel. */
function corto(texto: string, max = 60): string {
  const limpio = texto.replace(/\s+/g, ' ').trim()
  return limpio.length > max ? limpio.slice(0, max - 1) + '…' : limpio
}

/** Frase corta de lo que hace una llamada a herramienta. */
function describirLlamada(tool: string, args: Record<string, unknown>): string {
  const texto = (k: string) => (typeof args[k] === 'string' ? (args[k] as string) : '')
  switch (tool) {
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return `editando ${nombreArchivo(texto('file_path') || texto('notebook_path'))}`
    case 'Read':
      return `leyendo ${nombreArchivo(texto('file_path'))}`
    case 'Bash':
    case 'PowerShell':
      return `ejecutando ${corto(texto('description') || texto('command'), 50)}`
    case 'Grep':
      return `buscando «${corto(texto('pattern'), 40)}»`
    case 'Glob':
      return `buscando archivos ${corto(texto('pattern'), 40)}`
    case 'WebSearch':
      return `buscando en la web «${corto(texto('query'), 40)}»`
    case 'WebFetch':
      return `leyendo ${corto(texto('url'), 50)}`
    case 'Agent':
      return `lanzando agente: ${corto(texto('description'), 40)}`
    default:
      return `usando ${tool}`
  }
}

/** Tiempo como «m:ss» o «h:mm:ss». */
function duracion(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // Fila de la conversación principal, con su modelo y la hora de arranque.
    const ahora = await $.clock.now()
    const modelo = await $.session.model()
    await update($, agentes, lista => {
      const sinPrincipal = lista.filter(f => f.id !== PRINCIPAL)
      const principal: FilaAgente = {
        id: PRINCIPAL, nombre: 'Conversación', modelo, estado: 'esperando', accion: '—', inicio: ahora,
      }
      return [principal, ...sinPrincipal]
    })

    // Reloj: redibuja una vez por segundo, pero solo si alguien está trabajando.
    $.clock.every(1000, () => {
      if (hayTrabajando) $.ui.invalidate('ui.render')
    })

    // Comando para mostrar u ocultar el panel. Si falla, el resto del mod sigue.
    try {
      await $.command.register({ name: 'agents-panel', description: 'Muestra u oculta el panel de agentes', immediate: true })
    } catch {
      // Nombre ocupado u otro problema: sin comando, pero sin romper nada.
    }

    // Abre el panel solo donde hay alguien mirando (no en `claude -p` ni en el SDK).
    // Si el terminal es estrecho, queda en espera; si no se puede, se ignora.
    if (e.isInteractive && e.surface !== null) {
      try {
        await $.ui.open(ABRIR)
      } catch {
        // Entorno sin panes: el mod sigue recogiendo datos sin dibujar.
      }
    }

    return next(e)
  })

  // /agents-panel: si el panel está abierto lo cierra; si no, lo abre.
  on('command.run', { command: 'agents-panel' }, async $ => {
    try {
      const abierto = (await $.ui.panes()).some(p => p.id === PANE)
      if (abierto) {
        await $.ui.close({ id: PANE })
        return { text: 'Panel de agentes oculto.' }
      }
      const r = await $.ui.open(ABRIR)
      return { text: r.isPlaced ? 'Panel de agentes abierto.' : 'Panel de agentes en espera (falta espacio).' }
    } catch {
      return { text: 'No se ha podido mostrar el panel en este entorno.' }
    }
  })

  // Un subagente arranca: se deja arrancar y se apunta con el modelo que resolvió el motor.
  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r.deny !== undefined || r.agentId === undefined) return r
    const ahora = await $.clock.now()
    const fila: FilaAgente = {
      id: r.agentId,
      nombre: corto(e.name ?? (e.description ? `${e.subagentType} · ${e.description}` : e.subagentType), 50),
      modelo: r.model,
      estado: 'trabajando',
      accion: 'arrancando',
      inicio: ahora,
      esCompanero: e.isTeammate === true,
    }
    await update($, agentes, lista => {
      const nueva = [...lista.filter(f => f.id !== fila.id), fila]
      hayTrabajando = true
      // La principal siempre arriba; de los subagentes, solo los últimos.
      return [...nueva.filter(f => f.id === PRINCIPAL), ...nueva.filter(f => f.id !== PRINCIPAL).slice(-MAX_FILAS)]
    })
    return r
  })
    // Si algo del panel falla, el subagente arranca igual: `next(e)` repite lo ya resuelto o lo lanza.
    .catch(($, e, next) => next(e))

  // Cada llamada a herramienta actualiza «qué está haciendo» el agente que la hace.
  on('tool.call', async ($, e, next) => {
    const id = e.agentId ?? PRINCIPAL
    const accion = describirLlamada(e.tool, e as unknown as Record<string, unknown>)
    await update($, agentes, lista => cambiarFila(lista, id, { accion, estado: 'trabajando' }))
    return next(e)
  })
    // El panel solo observa: si falla, la herramienta se ejecuta igual.
    .catch(($, e, next) => next(e))

  // Empieza un turno: el agente vuelve a trabajar (un compañero que despierta, o la principal).
  on('turn.start', async ($, e, next) => {
    const id = e.agentId ?? PRINCIPAL
    await update($, agentes, lista => cambiarFila(lista, id, { estado: 'trabajando', fin: undefined }))
    return next(e)
  })

  // Acaba un turno: la principal y los compañeros esperan; un subagente ha terminado.
  on('turn.complete', async ($, e, next) => {
    const id = e.agentId ?? PRINCIPAL
    const ahora = await $.clock.now()
    await update($, agentes, lista => {
      const fila = lista.find(f => f.id === id)
      if (fila === undefined) return lista
      const espera = id === PRINCIPAL || fila.esCompanero === true
      const estado: Estado = e.reason === 'error' ? 'fallido' : espera ? 'esperando' : 'terminado'
      return cambiarFila(lista, id, estado === 'esperando' ? { estado } : { estado, fin: ahora, accion: '—' })
    })
    return next(e)
  })

  // Dibujo del panel. Leer el atom hace que se redibuje solo cuando cambia la lista.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const lista = await read($, agentes)
    const ahora = await $.clock.now()

    return (
      <Box flexDirection="column">
        {lista.length === 0 && <Text dimColor>Aún no hay agentes.</Text>}
        {lista.map(f => (
          <Box flexDirection="column" marginBottom={1}>
            <Text>
              <Text color={COLOR[f.estado]}>● </Text>
              <Text bold>{f.nombre}</Text>
            </Text>
            <Text dimColor>
              {'  '}{f.modelo} · <Text color={COLOR[f.estado]}>{f.estado}</Text> · {duracion((f.fin ?? ahora) - f.inicio)}
            </Text>
            <Text dimColor>{'  '}{f.accion}</Text>
          </Box>
        ))}
      </Box>
    )
  })
}
