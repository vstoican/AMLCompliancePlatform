#!/usr/bin/env python3
"""
Transaction Simulator for AML Compliance Platform
Generates realistic transaction patterns and monitors real-time alert triggers
"""

import asyncio
import json
import random
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

import httpx
from rich.console import Console
from rich.layout import Layout
from rich.live import Live
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

console = Console()

# Configuration
API_BASE_URL = "http://localhost:8000"
SIMULATION_SPEED = 1.0  # Multiplier for delays (1.0 = real-time, 2.0 = 2x speed)


class AlertMonitor:
    """Monitors alerts in real-time"""

    def __init__(self):
        self.alerts: List[Dict[str, Any]] = []
        self.last_check = datetime.now(timezone.utc)
        self.total_alerts = 0

    async def check_new_alerts(self, client: httpx.AsyncClient) -> List[Dict[str, Any]]:
        """Fetch new alerts since last check"""
        try:
            response = await client.get(f"{API_BASE_URL}/alerts")
            response.raise_for_status()
            all_alerts = response.json()

            # Filter for alerts created since last check
            new_alerts = [
                alert
                for alert in all_alerts
                if datetime.fromisoformat(alert["created_at"].replace("Z", "+00:00"))
                > self.last_check
            ]

            self.alerts.extend(new_alerts)
            self.total_alerts += len(new_alerts)
            self.last_check = datetime.now(timezone.utc)

            return new_alerts
        except Exception as e:
            console.print(f"[red]Error checking alerts: {e}[/red]")
            return []


class TransactionGenerator:
    """Generates realistic transaction patterns"""

    CHANNELS = ["CASH", "WIRE", "CARD", "MOBILE"]
    COUNTRIES = ["NL", "DE", "BE", "FR", "US", "GB", "CN", "RU", "AE", "BR"]
    MERCHANT_CATEGORIES = [
        "retail",
        "restaurant",
        "hotel",
        "transport",
        "entertainment",
        "utilities",
        "healthcare",
        "education",
        "real_estate",
        "gambling",
    ]

    def __init__(self, customer_id: UUID):
        self.customer_id = customer_id

    def generate_normal_transaction(self) -> Dict[str, Any]:
        """Generate a normal, low-risk transaction"""
        return {
            "customer_id": str(self.customer_id),
            "amount": round(random.uniform(10, 500), 2),
            "currency": "EUR",
            "channel": random.choice(["CARD", "MOBILE"]),
            "country": "NL",
            "merchant_category": random.choice(["retail", "restaurant", "utilities"]),
        }

    def generate_cash_transaction(self, amount: float) -> Dict[str, Any]:
        """Generate a cash transaction (can trigger CASH_OVER_10K_EUR)"""
        return {
            "customer_id": str(self.customer_id),
            "amount": round(amount, 2),
            "currency": "EUR",
            "channel": "CASH",
            "country": "NL",
            "merchant_category": "retail",
        }

    def generate_cross_border_transaction(self, amount: float, country: str) -> Dict[str, Any]:
        """Generate a cross-border transaction (can trigger EXTERNAL_TRANSFER_OVER_10K_EUR)"""
        return {
            "customer_id": str(self.customer_id),
            "amount": round(amount, 2),
            "currency": "EUR",
            "channel": "WIRE",
            "country": country,
            "merchant_category": "transfer",
        }

    def generate_remittance_transaction(self, amount: float, country: str) -> Dict[str, Any]:
        """Generate a remittance transaction (can trigger REMITTANCE_OVER_2K_EUR)"""
        return {
            "customer_id": str(self.customer_id),
            "amount": round(amount, 2),
            "currency": "EUR",
            "channel": "WIRE",
            "country": country,
            "merchant_category": "remittance",
        }

    def generate_high_velocity_pattern(self) -> List[Dict[str, Any]]:
        """Generate a burst of transactions (velocity pattern)"""
        count = random.randint(10, 20)
        return [self.generate_normal_transaction() for _ in range(count)]


class Simulator:
    """Main simulator orchestrator"""

    def __init__(self):
        self.client = httpx.AsyncClient(timeout=30.0)
        self.monitor = AlertMonitor()
        self.customer_id: Optional[UUID] = None
        self.transaction_count = 0
        self.scenarios_triggered = []

    async def setup(self) -> None:
        """Create a test customer"""
        try:
            # Check if API is available
            response = await self.client.get(f"{API_BASE_URL}/health")
            response.raise_for_status()

            # Create customer
            customer_data = {
                "full_name": "Test Customer (Simulator)",
                "email": f"simulator+{uuid4().hex[:8]}@test.com",
                "country": "NL",
                "indicators": {
                    "geography_risk": 3.0,
                    "product_risk": 2.0,
                    "behavior_risk": 2.0,
                    "adverse_media": False,
                    "pep_flag": False,
                    "sanctions_hit": False,
                },
            }

            response = await self.client.post(f"{API_BASE_URL}/customers", json=customer_data)
            response.raise_for_status()
            customer = response.json()
            self.customer_id = UUID(customer["id"])

            console.print(
                f"[green]✓[/green] Created test customer: {customer['full_name']} ({self.customer_id})"
            )
            console.print(f"   Risk Level: {customer['risk_level']}")
        except Exception as e:
            console.print(f"[red]✗[/red] Setup failed: {e}")
            raise

    async def send_transaction(self, tx_data: Dict[str, Any]) -> Dict[str, Any]:
        """Send a transaction to the API"""
        try:
            response = await self.client.post(f"{API_BASE_URL}/transactions", json=tx_data)
            response.raise_for_status()
            result = response.json()
            self.transaction_count += 1
            return result
        except Exception as e:
            console.print(f"[red]✗[/red] Transaction failed: {e}")
            raise

    async def run_scenario_normal(self) -> None:
        """Scenario: Normal transaction activity"""
        console.print("\n[cyan]━━━ Scenario: Normal Activity ━━━[/cyan]")
        generator = TransactionGenerator(self.customer_id)

        for i in range(5):
            tx = generator.generate_normal_transaction()
            result = await self.send_transaction(tx)
            console.print(
                f"[dim]  Transaction {i+1}:[/dim] €{tx['amount']:.2f} via {tx['channel']}"
            )
            await asyncio.sleep(1 / SIMULATION_SPEED)

        console.print("[green]✓[/green] Normal activity completed (should not trigger alerts)")

    async def run_scenario_cash_over_10k(self) -> None:
        """Scenario: Cash transaction over €10,000 (triggers alert)"""
        console.print("\n[cyan]━━━ Scenario: Large Cash Transaction ━━━[/cyan]")
        generator = TransactionGenerator(self.customer_id)

        amount = round(random.uniform(10000, 15000), 2)
        tx = generator.generate_cash_transaction(amount)

        console.print(f"[yellow]⚠[/yellow]  Sending: €{amount:,.2f} CASH (should trigger alert)")
        await self.send_transaction(tx)

        # Wait for alert to be processed
        await asyncio.sleep(2 / SIMULATION_SPEED)

        # Check for alerts
        new_alerts = await self.monitor.check_new_alerts(self.client)
        if new_alerts:
            for alert in new_alerts:
                console.print(f"[red]🚨 ALERT TRIGGERED:[/red] {alert['type']}")
                console.print(f"   Severity: {alert['severity']}")
                console.print(f"   Details: {json.dumps(alert['details'], indent=2)}")
            self.scenarios_triggered.append("CASH_OVER_10K_EUR")
        else:
            console.print("[yellow]⚠[/yellow] No alert detected (may be processing)")

    async def run_scenario_cross_border(self) -> None:
        """Scenario: Large cross-border transfer (triggers alert)"""
        console.print("\n[cyan]━━━ Scenario: Large Cross-Border Transfer ━━━[/cyan]")
        generator = TransactionGenerator(self.customer_id)

        amount = round(random.uniform(10000, 20000), 2)
        country = random.choice(["US", "CN", "RU"])
        tx = generator.generate_cross_border_transaction(amount, country)

        console.print(
            f"[yellow]⚠[/yellow]  Sending: €{amount:,.2f} WIRE to {country} (should trigger alert)"
        )
        await self.send_transaction(tx)

        await asyncio.sleep(2 / SIMULATION_SPEED)

        new_alerts = await self.monitor.check_new_alerts(self.client)
        if new_alerts:
            for alert in new_alerts:
                console.print(f"[red]🚨 ALERT TRIGGERED:[/red] {alert['type']}")
                console.print(f"   Severity: {alert['severity']}")
                console.print(f"   Details: {json.dumps(alert['details'], indent=2)}")
            self.scenarios_triggered.append("EXTERNAL_TRANSFER_OVER_10K_EUR")
        else:
            console.print("[yellow]⚠[/yellow] No alert detected (may be processing)")

    async def run_scenario_remittance(self) -> None:
        """Scenario: Large remittance (triggers alert)"""
        console.print("\n[cyan]━━━ Scenario: Large Remittance ━━━[/cyan]")
        generator = TransactionGenerator(self.customer_id)

        amount = round(random.uniform(2000, 5000), 2)
        country = random.choice(["BR", "PH", "IN", "PK"])
        tx = generator.generate_remittance_transaction(amount, country)

        console.print(
            f"[yellow]⚠[/yellow]  Sending: €{amount:,.2f} remittance to {country} (should trigger alert)"
        )
        await self.send_transaction(tx)

        await asyncio.sleep(2 / SIMULATION_SPEED)

        new_alerts = await self.monitor.check_new_alerts(self.client)
        if new_alerts:
            for alert in new_alerts:
                console.print(f"[red]🚨 ALERT TRIGGERED:[/red] {alert['type']}")
                console.print(f"   Severity: {alert['severity']}")
                console.print(f"   Details: {json.dumps(alert['details'], indent=2)}")
            self.scenarios_triggered.append("REMITTANCE_OVER_2K_EUR")
        else:
            console.print("[yellow]⚠[/yellow] No alert detected (may be processing)")

    async def run_scenario_velocity(self) -> None:
        """Scenario: High transaction velocity"""
        console.print("\n[cyan]━━━ Scenario: High Velocity (Burst Pattern) ━━━[/cyan]")
        generator = TransactionGenerator(self.customer_id)

        transactions = generator.generate_high_velocity_pattern()
        console.print(f"[yellow]⚠[/yellow]  Sending {len(transactions)} rapid transactions...")

        for i, tx in enumerate(transactions):
            await self.send_transaction(tx)
            if (i + 1) % 5 == 0:
                console.print(f"[dim]  Sent {i+1}/{len(transactions)} transactions[/dim]")
            await asyncio.sleep(0.1 / SIMULATION_SPEED)

        console.print("[green]✓[/green] Velocity pattern completed")

        # Velocity patterns might trigger custom alerts if configured
        await asyncio.sleep(2 / SIMULATION_SPEED)
        new_alerts = await self.monitor.check_new_alerts(self.client)
        if new_alerts:
            for alert in new_alerts:
                console.print(f"[red]🚨 ALERT TRIGGERED:[/red] {alert['type']}")
                self.scenarios_triggered.append("VELOCITY_PATTERN")

    async def run_all_scenarios(self) -> None:
        """Run all predefined scenarios"""
        scenarios = [
            ("Normal Activity", self.run_scenario_normal),
            ("Cash Over €10k", self.run_scenario_cash_over_10k),
            ("Cross-Border Transfer", self.run_scenario_cross_border),
            ("Remittance", self.run_scenario_remittance),
            ("High Velocity", self.run_scenario_velocity),
        ]

        for name, scenario_fn in scenarios:
            try:
                await scenario_fn()
                await asyncio.sleep(1 / SIMULATION_SPEED)
            except Exception as e:
                console.print(f"[red]✗[/red] Scenario '{name}' failed: {e}")

    def print_summary(self) -> None:
        """Print simulation summary"""
        console.print("\n" + "=" * 60)
        console.print("[bold cyan]SIMULATION SUMMARY[/bold cyan]")
        console.print("=" * 60)

        summary_table = Table(show_header=False, box=None)
        summary_table.add_column(style="cyan")
        summary_table.add_column(style="white")

        summary_table.add_row("Customer ID:", str(self.customer_id))
        summary_table.add_row("Total Transactions:", str(self.transaction_count))
        summary_table.add_row("Total Alerts Triggered:", str(self.monitor.total_alerts))
        summary_table.add_row(
            "Scenarios Triggered:", ", ".join(self.scenarios_triggered) or "None"
        )

        console.print(summary_table)

        if self.monitor.alerts:
            console.print("\n[bold yellow]Alerts Generated:[/bold yellow]")
            alerts_table = Table()
            alerts_table.add_column("ID", style="cyan")
            alerts_table.add_column("Type", style="yellow")
            alerts_table.add_column("Severity", style="red")
            alerts_table.add_column("Status", style="green")

            for alert in self.monitor.alerts:
                alerts_table.add_row(
                    str(alert["id"]), alert["type"], alert["severity"], alert["status"]
                )

            console.print(alerts_table)

        console.print(f"\n[dim]View in browser: {API_BASE_URL}/alerts[/dim]")
        console.print("=" * 60)

    async def cleanup(self) -> None:
        """Cleanup resources"""
        await self.client.aclose()


async def main():
    """Main entry point"""
    console.print("[bold cyan]AML Transaction Simulator[/bold cyan]")
    console.print("[dim]Generating realistic transaction patterns...[/dim]\n")

    simulator = Simulator()

    try:
        await simulator.setup()
        await simulator.run_all_scenarios()
        simulator.print_summary()
    except KeyboardInterrupt:
        console.print("\n[yellow]Simulation interrupted by user[/yellow]")
        simulator.print_summary()
    except Exception as e:
        console.print(f"\n[red]Simulation failed: {e}[/red]")
        import traceback

        traceback.print_exc()
    finally:
        await simulator.cleanup()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        console.print("\n[yellow]Exiting...[/yellow]")
        sys.exit(0)
