import os
import shutil

# Set env vars for local Windows run before importing app modules
os.environ["UPLOADS_DIR"] = "./data/uploads"
os.environ["CHROMA_PERSIST_DIR"] = "./data/chroma"
# Also using the API key from root .env if it wasn't picked up automatically
# Though pydantic models load from .env, it defaults to .env in cwd.
os.environ["DATABASE_URL"] = "sqlite:///./data/vyntic.db"

# Delete data directory to force re-ingestion
if os.path.exists("./data"):
    print("Deleting old data directory...")
    # have to ignore errors safely in windows sometimes
    shutil.rmtree("./data", ignore_errors=True)

os.makedirs("./data/uploads", exist_ok=True)
os.makedirs("./data/chroma", exist_ok=True)

import asyncio
from app.seed import seed_sample_data
from app.database import init_db

async def main():
    print("Initializing DB...")
    init_db()
    
    print("Running seed_sample_data...")
    await seed_sample_data()
    print("Finished.")

if __name__ == "__main__":
    asyncio.run(main())
