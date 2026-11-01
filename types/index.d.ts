// Contrato de estado del mod: lo que se guarda en $.state y sobrevive a una recarga.

/** Estado que enseña el panel, cada uno con su color. */
export type Estado = 'trabajando' | 'esperando' | 'terminado' | 'fallido'

/** Una fila del panel: el agente principal o un subagente. */
export type FilaAgente = {
  /** `principal` para la conversación; si no, el agentId del subagente. */
  id: string
  nombre: string
  modelo: string
  estado: Estado
  /** Última acción, sacada de su última llamada a herramienta. */
  accion: string
  /** Milisegundos desde 1970 en que arrancó. */
  inicio: number
  /** Cuándo terminó, para congelar el tiempo; ausente mientras sigue. */
  fin?: number
  /** Un compañero de equipo no termina: espera mensajes. */
  esCompanero?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'agent-panel': { agentes: Shaped<FilaAgente[]> }
  }
}
