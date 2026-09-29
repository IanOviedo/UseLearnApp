# useLearn

App local para estudiar a partir de tus propios apuntes: pegás un texto (o subís un PDF), la app
extrae los sub-temas con un modelo, te hace un sondeo de opción múltiple para diagnosticar qué no
sabés y arma un plan de refuerzo.

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

- `app/` — landing (ingesta, ajustes, sesiones pasadas) y `app/sondeo/[id]` (sondeo → plan).
- `app/api/` — `sesiones/*`, `sondeo/*`, `modelos/listar`, `archivos/extraer-pdf`.
- `lib/` — `db.ts` (SQLite), `ollama.ts` (gateway de modelos + prompts), `sondeo.ts` (lógica
  compartida del sondeo), `config.ts` (defaults y límites), `texto.ts`, `proveedores.ts`, `tipos.ts`.
- `components/` — `sondeo/FaseSondeo.tsx`, `sondeo/FasePlan.tsx`, `ui/Iconos.tsx`.

## Scripts

```bash
npm run dev     # desarrollo
npm run build   # build de producción
npm run lint    # eslint
```

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

