#!/usr/bin/env python3
"""
Real-Time Alert Monitor Dashboard
Watches for alerts and displays them in a live-updating terminal UI
"""

import asyncio
from datetime import datetime
from typing import Any, Dict, List

import httpx
from rich.console import Console
from rich.layout import Layout
from rich.live import Live
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

console = Console()

API_BASE_URL = "http://localhost:8000"
REFRESH_INTERVAL = 2  # seconds


class AlertDashboard:
    """Live dashboard for monitoring alerts"""

    def __init__(self):
        self.alerts: List[Dict[str, Any]] = []
        self.last_alert_id = 0
        self.stats = {
            "total_alerts": 0,
            "open": 0,
            "investigating": 0,
            "escalated": 0,
            "closed": 0,
            "false_positive": 0,
        }
        self.alert_types = {}
        self.client = httpx.AsyncClient(timeout=10.0)
        self.start_time = datetime.utcnow()

    async def fetch_alerts(self) -> None:
        """Fetch latest alerts from API"""
        try:
            response = await self.client.get(f"{API_BASE_URL}/alerts")
            if response.status_code == 200:
                all_alerts = response.json()

                # Sort by ID descending (newest first)
                all_alerts.sort(key=lambda x: x["id"], reverse=True)

                # Keep only the latest 20 alerts for display
                self.alerts = all_alerts[:20]

                # Update statistics
                self.stats["total_alerts"] = len(all_alerts)
                self.stats["open"] = sum(1 for a in all_alerts if a["status"] == "OPEN")
                self.stats["investigating"] = sum(
                    1 for a in all_alerts if a["status"] == "INVESTIGATING"
                )
                self.stats["escalated"] = sum(1 for a in all_alerts if a["status"] == "ESCALATED")
                self.stats["closed"] = sum(1 for a in all_alerts if a["status"] == "CLOSED")
                self.stats["false_positive"] = sum(
                    1 for a in all_alerts if a["status"] == "FALSE_POSITIVE"
                )

                # Count alert types
                self.alert_types = {}
                for alert in all_alerts:
                    alert_type = alert.get("type", "UNKNOWN")
                    self.alert_types[alert_type] = self.alert_types.get(alert_type, 0) + 1

                # Check for new alerts
                if all_alerts:
                    latest_id = all_alerts[0]["id"]
                    if latest_id > self.last_alert_id:
                        # Play a sound or notification (terminal bell)
                        print("\a", end="", flush=True)
                        self.last_alert_id = latest_id

        except Exception as e:
            console.print(f"[red]Error fetching alerts: {e}[/red]")

    def make_stats_panel(self) -> Panel:
        """Create statistics panel"""
        stats_table = Table.grid(padding=(0, 2))
        stats_table.add_column(style="cyan", justify="right")
        stats_table.add_column(style="white bold")

        stats_table.add_row("Total Alerts:", str(self.stats["total_alerts"]))
        stats_table.add_row(
            "Open:", f"[yellow]{self.stats['open']}[/yellow]" if self.stats["open"] > 0 else "0"
        )
        stats_table.add_row(
            "Investigating:",
            f"[blue]{self.stats['investigating']}[/blue]" if self.stats["investigating"] > 0 else "0",
        )
        stats_table.add_row(
            "Escalated:",
            f"[red]{self.stats['escalated']}[/red]" if self.stats["escalated"] > 0 else "0",
        )
        stats_table.add_row(
            "Closed:",
            f"[green]{self.stats['closed']}[/green]" if self.stats["closed"] > 0 else "0",
        )
        stats_table.add_row(
            "False Positives:",
            f"[dim]{self.stats['false_positive']}[/dim]"
            if self.stats["false_positive"] > 0
            else "0",
        )

        return Panel(stats_table, title="[bold cyan]Alert Statistics[/bold cyan]", border_style="cyan")

    def make_types_panel(self) -> Panel:
        """Create alert types panel"""
        types_table = Table.grid(padding=(0, 2))
        types_table.add_column(style="yellow")
        types_table.add_column(style="white", justify="right")

        if self.alert_types:
            for alert_type, count in sorted(
                self.alert_types.items(), key=lambda x: x[1], reverse=True
            ):
                types_table.add_row(alert_type, str(count))
        else:
            types_table.add_row("[dim]No alerts yet[/dim]", "")

        return Panel(types_table, title="[bold yellow]Alert Types[/bold yellow]", border_style="yellow")

    def make_alerts_table(self) -> Table:
        """Create table of recent alerts"""
        table = Table(title="Recent Alerts (Last 20)", show_header=True, header_style="bold magenta")
        table.add_column("ID", style="cyan", width=6)
        table.add_column("Time", style="dim", width=16)
        table.add_column("Type", style="yellow", width=30)
        table.add_column("Severity", width=10)
        table.add_column("Status", width=15)
        table.add_column("Customer", style="blue", width=36)

        if not self.alerts:
            return table

        for alert in self.alerts:
            # Format timestamp
            created_at = datetime.fromisoformat(alert["created_at"].replace("Z", "+00:00"))
            time_str = created_at.strftime("%H:%M:%S")

            # Color code severity
            severity = alert["severity"]
            if severity == "high":
                severity_str = f"[red]{severity}[/red]"
            elif severity == "medium":
                severity_str = f"[yellow]{severity}[/yellow]"
            else:
                severity_str = f"[blue]{severity}[/blue]"

            # Color code status
            status = alert["status"]
            if status == "OPEN":
                status_str = f"[yellow]{status}[/yellow]"
            elif status == "ESCALATED":
                status_str = f"[red]{status}[/red]"
            elif status == "INVESTIGATING":
                status_str = f"[blue]{status}[/blue]"
            elif status == "CLOSED":
                status_str = f"[green]{status}[/green]"
            else:
                status_str = f"[dim]{status}[/dim]"

            customer_id = str(alert.get("customer_id", "N/A"))[:36]

            table.add_row(
                str(alert["id"]), time_str, alert["type"], severity_str, status_str, customer_id
            )

        return table

    def make_layout(self) -> Layout:
        """Create the dashboard layout"""
        layout = Layout()
        layout.split_column(
            Layout(name="header", size=3),
            Layout(name="body"),
            Layout(name="footer", size=3),
        )

        layout["body"].split_row(
            Layout(name="left", ratio=1), Layout(name="right", ratio=2)
        )

        layout["left"].split_column(Layout(name="stats"), Layout(name="types"))

        # Header
        uptime = datetime.utcnow() - self.start_time
        uptime_str = str(uptime).split(".")[0]
        header_text = Text()
        header_text.append("🚨 ", style="bold red")
        header_text.append("AML Alert Monitor", style="bold cyan")
        header_text.append(f" │ Uptime: {uptime_str}", style="dim")
        layout["header"].update(Panel(header_text, border_style="cyan"))

        # Stats and types
        layout["stats"].update(self.make_stats_panel())
        layout["types"].update(self.make_types_panel())

        # Alerts table
        layout["right"].update(Panel(self.make_alerts_table(), border_style="magenta"))

        # Footer
        footer_text = Text()
        footer_text.append("Refreshing every ", style="dim")
        footer_text.append(f"{REFRESH_INTERVAL}s", style="cyan")
        footer_text.append(" │ Press ", style="dim")
        footer_text.append("Ctrl+C", style="bold yellow")
        footer_text.append(" to exit", style="dim")
        layout["footer"].update(Panel(footer_text, border_style="blue"))

        return layout

    async def run(self) -> None:
        """Run the live dashboard"""
        with Live(self.make_layout(), refresh_per_second=1, screen=True) as live:
            try:
                while True:
                    await self.fetch_alerts()
                    live.update(self.make_layout())
                    await asyncio.sleep(REFRESH_INTERVAL)
            except KeyboardInterrupt:
                pass
            finally:
                await self.client.aclose()


async def main():
    """Main entry point"""
    console.print("[bold cyan]Starting AML Alert Monitor...[/bold cyan]")
    console.print("[dim]Connecting to API...[/dim]\n")

    # Test connection
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{API_BASE_URL}/health")
            response.raise_for_status()
            console.print("[green]✓[/green] Connected to API\n")
    except Exception as e:
        console.print(f"[red]✗[/red] Failed to connect to API: {e}")
        console.print(f"[dim]Make sure the API is running at {API_BASE_URL}[/dim]")
        return

    # Start dashboard
    dashboard = AlertDashboard()
    await dashboard.run()

    console.print("\n[yellow]Monitor stopped[/yellow]")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        console.print("\n[yellow]Exiting...[/yellow]")
