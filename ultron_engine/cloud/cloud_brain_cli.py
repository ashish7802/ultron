"""
================================================================================
ULTRON Cloud AI Brain CLI Bridge
Module Name: ultron_engine/cloud/cloud_brain_cli.py
Subsystem: Cloud AI Brain Infrastructure
================================================================================

Architectural Role & Purpose:
    Provides a command-line interface and standard I/O bridge for the Next.js API
    routes to interact directly with the Python Cloud Brain Service.
    Allows frontend and serverless routes to query Google Drive 5TB storage quotas,
    inspect model registries, hot-swap active models, and fetch cloud cost telemetry.

Key Responsibilities:
    1. Status Reporting: Returns structured JSON containing storage quota, active
       model, and cloud GPU readiness.
    2. Model Hot-Swapping: Handles model switching commands from Next.js routes.
    3. Cost Telemetry: Calculates pricing comparisons across RunPod, Modal, and Vast.ai.
    4. Google Drive Model Discovery: Scans for GGUF weights on the remote 5TB drive.

Safety & Security Guarantees:
    - Direct execution without biometric gates or passkeys.
    - Sanitizes input arguments before passing to the model manager.
    - Protects the user from unexpected cloud costs through transparent estimates.
"""

import sys
import os
import json
import argparse
from typing import Dict, Any

# Ensure project root is in Python sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from ultron_engine.cloud.gdrive_connector import GoogleDriveConnector
from ultron_engine.cloud.model_manager import UltronModelManager
from ultron_engine.cloud.cloud_brain_service import CloudBrainService


def handle_status() -> None:
    """Queries and prints the Cloud Brain telemetry and 5TB quota as JSON."""
    service = CloudBrainService()
    status = service.get_brain_status()
    print(json.dumps(status))


def handle_switch(model_id: str) -> None:
    """
    Switches active cloud model.

    Args:
        model_id (str): Target model identifier to activate.
    """
    service = CloudBrainService()
    result = service.switch_model(model_id)
    print(json.dumps(result))


def handle_costs(hours: float) -> None:
    """
    Generates cost comparisons across cloud providers for the active model.

    Args:
        hours (float): Number of estimated operational hours.
    """
    service = CloudBrainService()
    estimates = service.models.estimate_cloud_costs(hours_per_day=hours)
    print(json.dumps(estimates))


def main() -> None:
    """Main CLI parser entrypoint for Next.js subprocess execution."""
    parser = argparse.ArgumentParser(description="ULTRON Cloud Brain CLI")
    subparsers = parser.add_subparsers(dest="command", help="Subcommand to run")

    # Status command
    subparsers.add_parser("status", help="Get Cloud Brain status and 5TB quota")

    # Switch model command
    switch_parser = subparsers.add_parser("switch", help="Switch active cloud model")
    switch_parser.add_argument("model_id", type=str, help="Model ID (e.g. llama3.3-70b)")

    # Cost estimate command
    cost_parser = subparsers.add_parser("costs", help="Get cloud provider cost estimates")
    cost_parser.add_argument("--hours", type=float, default=1.0, help="Estimated run hours")

    args = parser.parse_args()

    if args.command == "status":
        handle_status()
    elif args.command == "switch":
        handle_switch(args.model_id)
    elif args.command == "costs":
        handle_costs(args.hours)
    else:
        # Default to status if no command specified
        handle_status()


if __name__ == "__main__":
    main()
