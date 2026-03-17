# Vyntic — Local Iteration Roadmap

## Phase 1: Core UX Polish
- [ ] Streaming responses — Stream LLM output token-by-token into matrix cells
- [ ] Query history & templates — Pre-built PE question templates
- [ ] Export to Excel/PDF — Export matrix grid for deal team / IC sharing

## Phase 2: Deal Management
- [ ] Drag-and-drop file upload — Drop files directly onto deal cards
- [ ] Deal status & tags — Pipeline stages and sector tags
- [ ] Multi-file upload — Upload entire data rooms per deal

## Phase 3: Analysis Quality
- [ ] Conversation memory per deal — Follow-up questions with prior context
- [ ] Side-by-side document viewer — Click citation to open source document page
- [ ] Synthesis row — Auto-generate comparison summary row for multi-deal queries

## Phase 4: Pre-Production Prep
- [ ] Swap Ollama → Claude API — Replace DeepSeek with Claude via Anthropic SDK
- [ ] Swap ChromaDB → Pinecone/Weaviate — Managed vector DB with persistent storage
- [ ] Auth & multi-tenancy — User login with per-firm deal isolation

## Priority Order for Next Session
1. Streaming responses
2. Export to Excel/PDF
3. Conversation memory per deal
4. Synthesis row
