# Student Dataset + AI API

A small Cloudflare Worker that turns Code.org-style CSV files into JSON APIs for student frontend projects. It also includes a grounded chat endpoint that lets Cloudflare Workers AI query one selected dataset through a visible `query_dataset` tool call.

> **Instructor setup:** replace `YOUR-GITHUB-USERNAME` in the button below after publishing this repository publicly. Cloudflare's deploy flow needs the public GitHub repository URL.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/YOUR-GITHUB-USERNAME/student-data-api)

The deploy flow creates a copy of the repository in the student's GitHub account, provisions the Workers AI binding, deploys the Worker, and connects future repository pushes to automatic deployments. Students do not need an API key, a Hugging Face account, a local server, or a local deployment CLI.

## What students get

```text
CSV
 ↓
REST API
 ↓
JSON
 ↓
JavaScript fetch()
 ↓
frontend application
 ↓
AI chat endpoint
 ↓
LLM tool call
 ↓
dataset records
```

The API is the product. Student frontend applications remain separate and can be hosted on Code.org, GitHub Pages, Cloudflare Pages, Replit, a local server, or another browser-based environment.

## Canonical API

```http
GET  /api/v1/datasets
GET  /api/v1/datasets/{dataset}/records
POST /api/v1/datasets/{dataset}/chat
```

After deployment, open the Worker URL to find the dataset-list endpoint. No configuration is required to use the included datasets.

### List datasets

```http
GET /api/v1/datasets
```

Example response:

```json
{
  "datasets": [
    {
      "id": "cats",
      "description": "Cat breeds, origins, temperaments, life spans, weights, and images"
    },
    {
      "id": "board-games",
      "description": "Board games with player counts, play times, categories, mechanics, and designers"
    },
    {
      "id": "viral-50-usa",
      "description": "A sample Viral 50 USA music chart with track positions and artists"
    }
  ]
}
```

### Get records

```http
GET /api/v1/datasets/viral-50-usa/records?search=Dolly&limit=10&offset=0
```

Supported query parameters:

| Parameter | Meaning | Default |
| --- | --- | --- |
| `limit` | Maximum records returned (1–100) | `20` |
| `offset` | Matching records to skip | `0` |
| `search` | Case-insensitive text search across every field | empty |

Example response:

```json
{
  "dataset": "viral-50-usa",
  "count": 10,
  "total": 17,
  "limit": 10,
  "offset": 0,
  "records": [
    {
      "id": "1",
      "Position": "1",
      "Track Name": "I Will Always Love You",
      "Artist": "Dolly Parton"
    }
  ]
}
```

The CSV parser supports headers, quoted values, embedded commas, empty fields, and typical Code.org CSV exports. CSV values remain strings, which matches what students see when working with CSV data.

### Chat with one dataset

```http
POST /api/v1/datasets/viral-50-usa/chat
Content-Type: application/json

{
  "message": "Which Dolly Parton songs appear in this dataset?"
}
```

Example response:

```json
{
  "dataset": "viral-50-usa",
  "response": "The dataset includes...",
  "tool_calls": [
    {
      "tool": "query_dataset",
      "arguments": {
        "search": "Dolly Parton",
        "limit": 20,
        "offset": 0
      }
    }
  ],
  "mode": "workers-ai",
  "model": "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
}
```

The route—not the model—selects the dataset. A chat request to `/viral-50-usa/chat` can search only `viral-50-usa`; the tool schema does not contain a dataset argument. Tool-call metadata is intentionally returned so students can inspect the sequence:

```text
question → LLM → query_dataset → CSV records → LLM answer
```

If Workers AI is not available during local development, the endpoint returns a clearly labeled `"mode": "mock"` response. Deployment uses the Workers AI binding automatically—there are no API keys to add later.

## Use from a frontend

Records:

```js
const response = await fetch(
  "https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/api/v1/datasets/viral-50-usa/records?limit=10"
);

const data = await response.json();
console.log(data.records);
```

Chat:

```js
const response = await fetch(
  "https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/api/v1/datasets/viral-50-usa/chat",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Which artists appear more than once?"
    })
  }
);

const data = await response.json();
console.log(data.response);
console.log(data.tool_calls);
```

All API responses include permissive CORS headers so browser projects hosted elsewhere can call the Worker.

## Add a dataset

Adding a dataset requires data and configuration only—no route or backend code changes.

1. Add a CSV file to `data/`, for example `data/video-games.csv`.
2. Add an entry to `config/datasets.json`:

   ```json
   {
     "video-games": {
       "file": "data/video-games.csv",
       "description": "Video game dataset"
     }
   }
   ```

3. Commit and push the changes.

Cloudflare automatically rebuilds and deploys the Worker. These routes now exist:

```http
GET  /api/v1/datasets/video-games/records
POST /api/v1/datasets/video-games/chat
```

The build copies the registered CSV files into the Worker's static-asset bundle without converting them. Files in `data/` remain the source of truth.

## Configuration

### Datasets

Edit [`config/datasets.json`](config/datasets.json) to register CSV files and descriptions.

### Model

Edit [`config/llm.json`](config/llm.json) to change the Cloudflare Workers AI model, temperature, or output limit:

```json
{
  "provider": "cloudflare",
  "model": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "temperature": 0.2,
  "max_tokens": 500
}
```

Choose a Workers AI text-generation model that supports function calling.

### Tool limits

Edit [`config/tools.json`](config/tools.json) to enable or disable the initial tool and tune its default result size, maximum result size, offset/search behavior, or maximum calls.

The MVP intentionally has only one tool:

```text
query_dataset(search, limit, offset)
```

## Project structure

```text
student-data-api/
├── src/
│   ├── index.js        # routing, request validation, and CORS
│   ├── datasets.js     # CSV loading, parsing, search, and pagination
│   ├── chat.js         # Workers AI inference and grounded response
│   ├── tools.js        # constrained query_dataset tool
│   └── http.js         # JSON response helpers
├── data/               # source-of-truth CSV files
├── config/
│   ├── datasets.json
│   ├── llm.json
│   └── tools.json
├── public/data/        # generated static-asset copies (not edited)
├── scripts/copy-data.mjs
├── wrangler.jsonc
├── wrangler.local.jsonc # local mock-chat config; no Cloudflare login
├── package.json
└── README.md
```

## Local development (instructors and contributors)

Students using the one-click deploy do not need these steps.

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm test
npm run check
```

`npm run dev` prepares the CSV static assets and starts Wrangler with `wrangler.local.jsonc`, which intentionally omits the remote AI binding. Records and dataset discovery work normally and chat uses its labeled mock response. `wrangler.jsonc` remains the deployment configuration and includes real Workers AI.

## Before publishing the template

1. Create a public GitHub repository from this directory.
2. Replace the `YOUR-GITHUB-USERNAME` placeholder in the deploy-button URL with the repository owner's GitHub username. Change `student-data-api` too if the repository has a different name.
3. Confirm the deploy button opens Cloudflare's setup flow.
4. Mark the GitHub repository as a template if students should create copies directly from GitHub as well.

Cloudflare reads `wrangler.jsonc`, automatically provisions the `AI` binding during one-click deployment, and uses the repository's build/deploy scripts.

## Data license

The included sample datasets were provided as Code.org datasets under the [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International license](https://creativecommons.org/licenses/by-nc-sa/4.0/). See [`DATA_LICENSE.md`](DATA_LICENSE.md). Check the terms and provenance of any dataset before adding it.

## MVP boundaries

This project intentionally does not include a database, vector database, embeddings, a RAG framework, authentication, user accounts, persistent conversations, an admin dashboard, a complex query language, large-data processing, multiple agents, or analytics tools. Those are later learning extensions, not prerequisites for using this API.
