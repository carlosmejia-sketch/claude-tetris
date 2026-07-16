---
description: Crea un git worktree aislado y ejecuta en él el requerimiento indicado
argument-hint: <requerimiento a implementar>
allowed-tools: Bash(git worktree:*), Bash(git branch:*), Bash(cd:*), Read, Write, Edit, Glob, Grep
---

## Requerimiento

$ARGUMENTS

## Instrucciones

Vas a trabajar el requerimiento anterior en un **git worktree aislado**, sin tocar el código del directorio principal.

1. **Determina un nombre** corto en `kebab-case` que describa el requerimiento (ej. `bomba-mejorada`, `fix-colision-spawn`, `tema-oscuro`). El nombre lo eliges tú a partir del requerimiento.

2. **Crea el worktree** con una rama nueva del mismo nombre:
   ```bash
   git worktree add -b <nombre> ./trees/<nombre>
   ```
   Si la rama ya existe, usa `git worktree add ./trees/<nombre> <nombre>`.

3. **Trabaja exclusivamente dentro de `./trees/<nombre>/`**. Todas las lecturas y ediciones de archivos deben apuntar a rutas dentro de ese directorio. NO modifiques archivos del directorio raíz del proyecto — el worktree es una copia aislada.

4. **Implementa el requerimiento** completo dentro del worktree, respetando las convenciones del proyecto descritas en `CLAUDE.md`.

5. Al terminar, **informa de forma concisa**:
   - Nombre del worktree y rama creados
   - Ruta: `./trees/<nombre>/`
   - Resumen de los cambios realizados
   - Cómo revisar/mergear (ej. `git worktree list`, y luego merge de la rama a `main` cuando el usuario lo apruebe)

No hagas commit ni push salvo que el usuario lo pida explícitamente.
