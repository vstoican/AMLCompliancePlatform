#!/usr/bin/env python3
"""
Performance test for transaction processing throughput.
Compares sync (direct DB) vs async (NATS → Consumer → DB) modes.
"""

import asyncio
import aiohttp
import time
import random
import uuid
from datetime import datetime
import statistics
import argparse

API_BASE = "http://localhost:8000"

# Test configuration
NUM_TRANSACTIONS = 10000
CONCURRENT_REQUESTS = 500

# Sample data for generating transactions
FIRST_NAMES = ["John", "Jane", "Michael", "Sarah", "David", "Emma", "Robert", "Lisa"]
LAST_NAMES = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis"]
VENDORS = ["Vendor A", "Vendor B", "Vendor C", None]

async def get_customer_ids(session):
    """Fetch existing customer IDs"""
    async with session.get(f"{API_BASE}/customers?limit=100") as resp:
        if resp.status == 200:
            customers = await resp.json()
            return [c["id"] for c in customers] if customers else []
    return []

def generate_transaction(customer_ids, prefix="TX"):
    """Generate a random transaction matching the API schema"""
    amount = round(random.uniform(100, 50000), 2)
    return {
        "surrogate_id": f"{prefix}-{uuid.uuid4().hex[:12].upper()}",
        "person_first_name": random.choice(FIRST_NAMES),
        "person_last_name": random.choice(LAST_NAMES),
        "vendor_name": random.choice(VENDORS),
        "price_number_of_months": random.randint(1, 12),
        "grace_number_of_months": random.randint(0, 3),
        "original_transaction_amount": amount,
        "amount": amount,
        "vendor_transaction_id": f"VTX-{uuid.uuid4().hex[:8]}",
        "client_settlement_status": random.choice(["unpaid", "paid", "partial"]),
        "vendor_settlement_status": random.choice(["unpaid", "paid"]),
        "transaction_delivery_status": random.choice(["PENDING", "DELIVERED", "FAILED"]),
        "partial_delivery": random.choice([True, False]),
        "transaction_last_activity": "REGULAR",
        "transaction_financial_status": random.choice(["PENDING", "COMPLETED", "FAILED"]),
        "customer_id": random.choice(customer_ids) if customer_ids else None
    }

async def post_transaction(session, transaction, results, sync_mode=False):
    """Post a single transaction and record timing"""
    start = time.perf_counter()
    url = f"{API_BASE}/transactions"
    if sync_mode:
        url += "?sync=true"

    try:
        async with session.post(
            url,
            json=transaction,
            timeout=aiohttp.ClientTimeout(total=30)
        ) as resp:
            elapsed = time.perf_counter() - start
            success = resp.status in (200, 201)
            results.append({
                "success": success,
                "status": resp.status,
                "elapsed": elapsed
            })
            return success
    except Exception as e:
        elapsed = time.perf_counter() - start
        results.append({
            "success": False,
            "status": 0,
            "elapsed": elapsed,
            "error": str(e)
        })
        return False


async def post_batch(session, transactions, results):
    """Post a batch of transactions"""
    start = time.perf_counter()
    url = f"{API_BASE}/transactions/batch"

    try:
        async with session.post(
            url,
            json=transactions,
            timeout=aiohttp.ClientTimeout(total=60)
        ) as resp:
            elapsed = time.perf_counter() - start
            success = resp.status in (200, 201)
            data = await resp.json() if success else {}
            results.append({
                "success": success,
                "status": resp.status,
                "elapsed": elapsed,
                "count": len(transactions),
                "queued": data.get("queued", 0)
            })
            return success
    except Exception as e:
        elapsed = time.perf_counter() - start
        results.append({
            "success": False,
            "status": 0,
            "elapsed": elapsed,
            "count": len(transactions),
            "error": str(e)
        })
        return False

async def run_load_test(num_transactions, concurrent, sync_mode=False, prefix="TX"):
    """Run the load test"""
    mode_name = "SYNC (direct DB)" if sync_mode else "ASYNC (NATS → Consumer)"

    print("=" * 60)
    print(f"AML Platform - Transaction Performance Test")
    print(f"Mode: {mode_name}")
    print("=" * 60)
    print(f"\nConfiguration:")
    print(f"  Total transactions: {num_transactions}")
    print(f"  Concurrent requests: {concurrent}")
    print(f"  API endpoint: {API_BASE}/transactions{'?sync=true' if sync_mode else ''}")
    print()

    connector = aiohttp.TCPConnector(limit=concurrent)
    async with aiohttp.ClientSession(connector=connector) as session:
        # Get customer IDs
        print("Fetching customer IDs...")
        customer_ids = await get_customer_ids(session)
        if not customer_ids:
            print("Warning: No customers found, using random UUIDs")
        else:
            print(f"Found {len(customer_ids)} customers")

        # Generate transactions
        print(f"\nGenerating {num_transactions} test transactions...")
        transactions = [generate_transaction(customer_ids, prefix) for _ in range(num_transactions)]

        # Run load test
        print(f"\nStarting load test with {concurrent} concurrent requests...")
        print("-" * 60)

        results = []
        start_time = time.perf_counter()

        # Process with semaphore for concurrency control
        semaphore = asyncio.Semaphore(concurrent)

        async def bounded_post(tx):
            async with semaphore:
                return await post_transaction(session, tx, results, sync_mode)

        tasks = [bounded_post(tx) for tx in transactions]

        # Show progress
        completed = 0
        for coro in asyncio.as_completed(tasks):
            await coro
            completed += 1
            if completed % 500 == 0 or completed == num_transactions:
                elapsed = time.perf_counter() - start_time
                current_tps = completed / elapsed
                print(f"  Progress: {completed}/{num_transactions} ({100*completed/num_transactions:.0f}%) - {current_tps:.0f} TPS")

        total_time = time.perf_counter() - start_time

    # Calculate statistics
    print("\n" + "=" * 60)
    print("RESULTS")
    print("=" * 60)

    successful = [r for r in results if r["success"]]
    failed = [r for r in results if not r["success"]]
    latencies = [r["elapsed"] * 1000 for r in results]  # Convert to ms

    print(f"\nSummary:")
    print(f"  Total time: {total_time:.2f} seconds")
    print(f"  Successful: {len(successful)}/{num_transactions} ({100*len(successful)/num_transactions:.1f}%)")
    print(f"  Failed: {len(failed)}")

    tps = num_transactions / total_time
    print(f"\nThroughput:")
    print(f"  Transactions/second: {tps:.2f} TPS")
    print(f"  Successful TPS: {len(successful)/total_time:.2f} TPS")

    if latencies:
        print(f"\nLatency (ms):")
        print(f"  Min: {min(latencies):.2f}")
        print(f"  Max: {max(latencies):.2f}")
        print(f"  Mean: {statistics.mean(latencies):.2f}")
        print(f"  Median: {statistics.median(latencies):.2f}")
        if len(latencies) > 1:
            print(f"  Std Dev: {statistics.stdev(latencies):.2f}")

        # Percentiles
        sorted_latencies = sorted(latencies)
        p95_idx = int(len(sorted_latencies) * 0.95)
        p99_idx = int(len(sorted_latencies) * 0.99)
        print(f"  P95: {sorted_latencies[p95_idx]:.2f}")
        print(f"  P99: {sorted_latencies[p99_idx]:.2f}")

    if failed:
        print(f"\nErrors:")
        error_counts = {}
        for r in failed:
            key = r.get("error", f"HTTP {r['status']}")
            error_counts[key] = error_counts.get(key, 0) + 1
        for error, count in sorted(error_counts.items(), key=lambda x: -x[1])[:5]:
            print(f"  {error}: {count}")

    print("\n" + "=" * 60)
    return {
        "mode": "sync" if sync_mode else "async",
        "total_time": total_time,
        "tps": tps,
        "successful": len(successful),
        "failed": len(failed),
        "latency_mean": statistics.mean(latencies) if latencies else 0,
        "latency_p95": sorted_latencies[p95_idx] if latencies else 0,
    }

async def run_batch_test(num_transactions, batch_size=500, concurrent_batches=10, prefix="BATCH"):
    """Run batch API load test"""
    print("=" * 60)
    print("AML Platform - BATCH Transaction Performance Test")
    print("=" * 60)
    print(f"\nConfiguration:")
    print(f"  Total transactions: {num_transactions}")
    print(f"  Batch size: {batch_size}")
    print(f"  Concurrent batches: {concurrent_batches}")
    print(f"  API endpoint: {API_BASE}/transactions/batch")
    print()

    connector = aiohttp.TCPConnector(limit=concurrent_batches * 2)
    async with aiohttp.ClientSession(connector=connector) as session:
        # Get customer IDs
        print("Fetching customer IDs...")
        customer_ids = await get_customer_ids(session)
        if not customer_ids:
            print("Warning: No customers found")
        else:
            print(f"Found {len(customer_ids)} customers")

        # Generate all transactions
        print(f"\nGenerating {num_transactions} test transactions...")
        all_transactions = [generate_transaction(customer_ids, prefix) for _ in range(num_transactions)]

        # Split into batches
        batches = [all_transactions[i:i+batch_size] for i in range(0, len(all_transactions), batch_size)]
        print(f"Split into {len(batches)} batches of ~{batch_size} transactions each")

        # Run load test
        print(f"\nStarting batch load test...")
        print("-" * 60)

        results = []
        start_time = time.perf_counter()

        semaphore = asyncio.Semaphore(concurrent_batches)

        async def bounded_batch(batch):
            async with semaphore:
                return await post_batch(session, batch, results)

        tasks = [bounded_batch(batch) for batch in batches]

        completed_txns = 0
        for coro in asyncio.as_completed(tasks):
            await coro
            completed_txns += batch_size
            elapsed = time.perf_counter() - start_time
            current_tps = min(completed_txns, num_transactions) / elapsed
            print(f"  Progress: {min(completed_txns, num_transactions)}/{num_transactions} - {current_tps:.0f} TPS")

        total_time = time.perf_counter() - start_time

    # Calculate statistics
    print("\n" + "=" * 60)
    print("RESULTS")
    print("=" * 60)

    successful_batches = [r for r in results if r["success"]]
    total_queued = sum(r.get("queued", r.get("count", 0)) for r in successful_batches)
    latencies = [r["elapsed"] * 1000 for r in results]

    print(f"\nSummary:")
    print(f"  Total time: {total_time:.2f} seconds")
    print(f"  Batches sent: {len(results)}")
    print(f"  Successful batches: {len(successful_batches)}")
    print(f"  Transactions queued: {total_queued}")

    tps = num_transactions / total_time
    print(f"\nThroughput:")
    print(f"  Transactions/second: {tps:.2f} TPS")

    if latencies:
        print(f"\nBatch Latency (ms):")
        print(f"  Min: {min(latencies):.2f}")
        print(f"  Max: {max(latencies):.2f}")
        print(f"  Mean: {statistics.mean(latencies):.2f}")

    print("\n" + "=" * 60)
    return {"tps": tps, "total_time": total_time, "queued": total_queued}


async def compare_modes(num_transactions, concurrent):
    """Run both sync and async tests and compare results"""
    print("\n" + "=" * 70)
    print("COMPARISON TEST: SYNC vs ASYNC")
    print("=" * 70 + "\n")

    # Run sync test first
    print("Running SYNC test (direct database writes)...")
    sync_results = await run_load_test(num_transactions, concurrent, sync_mode=True, prefix="SYNC")

    print("\n\nWaiting 5 seconds before async test...\n")
    await asyncio.sleep(5)

    # Run async test
    print("Running ASYNC test (NATS → Consumer → DB)...")
    async_results = await run_load_test(num_transactions, concurrent, sync_mode=False, prefix="ASYNC")

    # Comparison summary
    print("\n" + "=" * 70)
    print("COMPARISON SUMMARY")
    print("=" * 70)
    print(f"\n{'Metric':<25} {'SYNC':<20} {'ASYNC':<20} {'Improvement':<15}")
    print("-" * 80)

    improvement_tps = ((async_results["tps"] - sync_results["tps"]) / sync_results["tps"]) * 100 if sync_results["tps"] > 0 else 0
    improvement_latency = ((sync_results["latency_mean"] - async_results["latency_mean"]) / sync_results["latency_mean"]) * 100 if sync_results["latency_mean"] > 0 else 0

    print(f"{'Throughput (TPS)':<25} {sync_results['tps']:<20.2f} {async_results['tps']:<20.2f} {improvement_tps:>+.1f}%")
    print(f"{'Mean Latency (ms)':<25} {sync_results['latency_mean']:<20.2f} {async_results['latency_mean']:<20.2f} {improvement_latency:>+.1f}%")
    print(f"{'P95 Latency (ms)':<25} {sync_results['latency_p95']:<20.2f} {async_results['latency_p95']:<20.2f}")
    print(f"{'Success Rate':<25} {100*sync_results['successful']/num_transactions:<20.1f}% {100*async_results['successful']/num_transactions:<20.1f}%")
    print()

    if async_results["tps"] > sync_results["tps"]:
        print(f"✅ ASYNC mode is {improvement_tps:.1f}% faster!")
    else:
        print(f"⚠️ SYNC mode is faster (consumer may need tuning or more replicas)")

    print("=" * 70)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AML Transaction Performance Test")
    parser.add_argument("--transactions", "-n", type=int, default=NUM_TRANSACTIONS,
                        help=f"Number of transactions to test (default: {NUM_TRANSACTIONS})")
    parser.add_argument("--concurrent", "-c", type=int, default=CONCURRENT_REQUESTS,
                        help=f"Concurrent requests (default: {CONCURRENT_REQUESTS})")
    parser.add_argument("--mode", "-m", choices=["sync", "async", "batch", "compare"], default="async",
                        help="Test mode: sync, async, batch (bulk API), or compare")
    parser.add_argument("--batch-size", "-b", type=int, default=500,
                        help="Batch size for batch mode (default: 500)")

    args = parser.parse_args()

    if args.mode == "compare":
        asyncio.run(compare_modes(args.transactions, args.concurrent))
    elif args.mode == "batch":
        asyncio.run(run_batch_test(args.transactions, batch_size=args.batch_size, concurrent_batches=args.concurrent))
    else:
        asyncio.run(run_load_test(args.transactions, args.concurrent, sync_mode=(args.mode == "sync")))
