import time
import os
import psutil
from pathlib import Path
from docling.document_converter import DocumentConverter

def get_memory_usage():
    process = psutil.Process(os.getpid())
    return process.memory_info().rss / (1024 * 1024)  # MB

def test_performance(directory: Path):
    files = list(directory.glob("acme_saas_extra_*.pdf"))
    if not files:
        print("No extra files found in", directory)
        return

    print(f"Starting performance test on {len(files)} documents...")
    print(f"{'File':<30} | {'Time (s)':<10} | {'Memory (MB)':<10}")
    print("-" * 55)

    converter = DocumentConverter()
    total_time = 0
    
    for i, file_path in enumerate(files, 1):
        start_time = time.time()
        try:
            result = converter.convert(file_path)
            duration = time.time() - start_time
            total_time += duration
            mem = get_memory_usage()
            print(f"{file_path.name:<30} | {duration:<10.2f} | {mem:<10.2f}")
        except Exception as e:
            print(f"Error parsing {file_path.name}: {e}")

    print("-" * 55)
    print(f"Total Time: {total_time:.2f}s")
    print(f"Average Time: {total_time / len(files):.2f}s")
    print(f"Final Memory: {get_memory_usage():.2f} MB")

if __name__ == "__main__":
    sample_dir = Path(__file__).resolve().parent.parent / "sample_data"
    test_performance(sample_dir)
