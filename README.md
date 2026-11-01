# agent-panel

Mod de Claude Code: un panel lateral que muestra en tiempo real la conversación y sus subagentes, con su nombre, modelo, estado (con color), lo que están haciendo y el tiempo que llevan.

- `/agents-panel` muestra u oculta el panel.
- Si el entorno no puede dibujar paneles (por ejemplo `claude -p`), el mod no hace nada y no molesta.

## Instalación

En el prompt de una sesión de Claude Code en la terminal:

```
/plugin install agent-panel --marketplace srmartigan/claude-agent-panel
```

Responde `y` para añadir el marketplace y elige el ámbito.

Desde una terminal:

```
claude plugin install agent-panel --marketplace srmartigan/claude-agent-panel
```

En la app de escritorio: pulsa + junto al cuadro del prompt, luego Plugins, «Add marketplace» con `srmartigan/claude-agent-panel` y después «Add plugin».
