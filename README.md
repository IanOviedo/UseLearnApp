# useLearn

App local para estudiar a partir de tus propios apuntes: pegás un texto (o subís un PDF), la app
extrae los sub-temas con un modelo, te hace un sondeo de opción múltiple para diagnosticar qué no
sabés, arma un plan de refuerzo y después te enseña: explicaciones ancladas a tus errores y ejercicios
(quiz y código con tests que corren en un sandbox) hasta cerrar la sesión.

Estado real del proyecto, verificado con evidencia (incluye los bugs corregidos y lo que falta):
**[ESTADO.md](./ESTADO.md)**.

## Cómo levantarlo

```bash
npm install
npm run dev      # http://localhost:3000
```

Necesita **Ollama** en `http://localhost:11434`, o un proveedor de nube compatible con OpenAI
(configurable en Ajustes, junto con Gemini nativo). En Ajustes se eligen dos modelos (preguntas del
sondeo / extracción de sub-temas y feedback) y se puede apagar la pre-generación del próximo lote.

## Base de datos

SQLite en `useLearn.db` (raíz del proyecto, o `USELEARN_DB`). Se crea sola: las migraciones son
idempotentes (`PRAGMA table_info` + `ALTER TABLE`). El archivo está en `.gitignore`.

## Estructura

- `app/` — landing (ingesta, ajustes, sesiones pasadas) y `app/sondeo/[id]` (sondeo → plan →
  enseñar/practicar → cierre, con la fase persistida en la base).
- `app/api/` — `sesiones/*` (crear, listar, detalle, eliminar, `[id]/fase`, `[id]/subtemas`),
  `sondeo/*`, `aprender/*` (bloque de material e intentos), `modelos/listar`, `archivos/extraer-pdf`.
- `lib/` — `db.ts` (SQLite), `ollama.ts` (gateway de modelos), `aprender.ts` (prompts y parsers de
  explicaciones y ejercicios), `sondeo.ts` (lógica compartida del sondeo), `practica.ts` (ruta por
  sub-tema), `config.ts` (defaults y límites), `config-cliente.ts` (config del navegador),
  `texto.ts`, `proveedores.ts`, `tipos.ts`.
- `components/` — `sondeo/FaseSondeo.tsx`, `sondeo/FasePlan.tsx`, `sondeo/FaseCierre.tsx`,
  `aprender/FaseEnsenar.tsx` + `EjercicioQuiz`/`EjercicioCodigo`/`EditorCodigo`/`RunnerSandbox`,
  `ui/Iconos.tsx`, `ui/Stepper.tsx`.

## Scripts

```bash
npm run dev     # desarrollo
npm run build   # build de producción
npm run lint    # eslint
```

## Humos end-to-end (a mano)

No hay tests automatizados todavía: la verificación se hace con dos scripts de PowerShell contra un
dev server con Ollama arriba y una **base temporal**, para no ensuciar tus sesiones (los scripts
borran la sesión que crean y devuelven exit 0/1).

```powershell
# terminal 1 — server con base temporal (la MISMA ruta que usa el humo de C/D)
$env:USELEARN_DB = "$env:TEMP\uselearn-smoke-cd.db"
npm run dev -- -p 3111

# terminal 2
powershell -NoProfile -ExecutionPolicy Bypass -File .smoke-c1.ps1       # C1: modalidades + confirmación de sub-temas (21 asserts)
powershell -NoProfile -ExecutionPolicy Bypass -File .smoke-fase-cd.ps1  # C2 + D: rutas, fases, material, intentos (36 asserts)
```

Ambos aceptan parámetros: `-BaseUrl`, `-Modelo` (por defecto `gemma4:e2b`, el chico, para ir rápido) y
el de C/D además `-DbPath`.

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

