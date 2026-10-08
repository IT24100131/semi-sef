"""
FishLink Agentic AI Subsystem — port 8000

Agents:
  1. Planning Agent           — orchestrates the workflow
  2. Quality Validation Agent — multi-step fraud & quality analysis (REAL)
  3. Market Intelligence Agent — WMA price model + DB blend (REAL)
  4. Buyer Matching Agent     — preference + bid history scoring (REAL)
  5. Logistics Scheduling Agent — 6-tool delivery plan creation (REAL)
"""

import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from typing import Optional
from datetime import datetime, timezone
import requests
import time
import math
import os

app = FastAPI(title="FishLink Agentic AI Subsystem")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Service URLs ──────────────────────────────────────────────────────────────
ASP_NET             = os.getenv("ASP_NET", "http://localhost:5157")
ASP_NET_API_URL     = f"{ASP_NET}/api/AgentGateway/webhook/status"
MARKET_STATS_URL    = f"{ASP_NET}/api/Catches/market-stats"
AVAILABLE_CATCHES   = f"{ASP_NET}/api/BuyerMatch/available"
VALIDATE_URL        = f"{ASP_NET}/api/Catches/validate"
PRICE_API_URL       = os.getenv("PRICE_API_URL", "http://localhost:8001/api/prices")

# ── Thresholds ────────────────────────────────────────────────────────────────
WEIGHT_DIFF_WARNING_PCT  = 10.0   # > 10% → warning
WEIGHT_DIFF_HIGH_PCT     = 25.0   # > 25% → high fraud risk
PRICE_ANOMALY_HIGH_PCT   = 50.0   # > 50% above market → flag
PRICE_ANOMALY_WARNING_PCT = 20.0  # > 20% above market → warning

# ── Request Models ────────────────────────────────────────────────────────────

class WorkflowRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    workflow_id:           str
    catch_id:              int
    fisherman_id:          int
    quantity_kg:           float   # declared weight
    asking_price:          float
    fish_species:          str
    # Structured quality fields (new)
    verified_weight_kg:    float = 0.0
    declared_quality_grade: str  = ""
    inspection_result:     str   = "Pending"
    catch_datetime:        Optional[str] = None
    seller_note:           str   = ""


class BuyerMatchRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    species:              str
    min_quantity_kg:      float = 0
    max_quantity_kg:      float = 99999
    max_price_per_kg:     float = 99999
    preferred_city:       Optional[str] = None
    buyer_id:             Optional[int] = None


class LogisticsRequest(BaseModel):
    """Request to Logistics Scheduling Agent — called after bid is accepted."""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    workflow_id:        Optional[str] = None
    catch_id:           int
    quantity_kg:        float = 50.0
    fish_species:       str = "Fish"
    pickup_location:    str = "Negombo"
    delivery_location:  str = "Colombo"
    delivery_deadline:  Optional[str] = None   # ISO datetime string
    buyer_name:         str = ""
    buyer_id:           Optional[int] = None
    order_id:           Optional[int] = None
    weight_kg:          Optional[float] = None


# ══════════════════════════════════════════════════════════════════════════════
# AGENT 5 — LOGISTICS SCHEDULING AGENT (6 Tools)
# ══════════════════════════════════════════════════════════════════════════════

LOGISTICS_BASE = f"{ASP_NET}/api/Logistics"
WEATHER_BASE   = f"{ASP_NET}/api/Weather"


# ── Tool 1: get_available_vehicles ────────────────────────────────────────────
def tool_get_available_vehicles(capacity_kg: float) -> list[dict]:
    """Fetch vehicles that can carry at least capacity_kg."""
    try:
        resp = requests.get(
            f"{LOGISTICS_BASE}/vehicles/available",
            params={"capacityKg": capacity_kg},
            timeout=5
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"[tool_get_available_vehicles] {e}")
        return []


# ── Tool 2: get_available_drivers ─────────────────────────────────────────────
def tool_get_available_drivers() -> list[dict]:
    """Fetch all available drivers."""
    try:
        resp = requests.get(f"{LOGISTICS_BASE}/drivers/available", timeout=5)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"[tool_get_available_drivers] {e}")
        return []


# ── Tool 3: get_cold_storage ─────────────────────────────────────────────────
def tool_get_cold_storage(capacity_kg: float) -> list[dict]:
    """Fetch cold storage with enough available capacity."""
    try:
        resp = requests.get(
            f"{LOGISTICS_BASE}/storage/available",
            params={"capacityKg": capacity_kg},
            timeout=5
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"[tool_get_cold_storage] {e}")
        return []


# ── Tool 4: get_route ────────────────────────────────────────────────────────
def tool_get_route(from_loc: str, to_loc: str) -> list[dict]:
    """Get available route options between two locations."""
    try:
        resp = requests.get(
            f"{LOGISTICS_BASE}/route",
            params={"from": from_loc, "to": to_loc},
            timeout=5
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("routes", [])
    except Exception as e:
        print(f"[tool_get_route] {e}")
        fl = (from_loc or "").lower()
        tl = (to_loc or "").lower()
        if "anuradhapura" in fl or "anuradhapura" in tl:
            return [{"routeName": "Route A (Central Expressway E04 & Kurunegala - Anuradhapura Highway A28)", "distanceKm": 205, "estimatedMinutes": 270, "notes": "Inland corridor"}]
        if "galle" in fl or "galle" in tl:
            return [{"routeName": "Route A (Southern Expressway E01 via Kottawa Interchange)", "distanceKm": 118, "estimatedMinutes": 95, "notes": "Expressway E01"}]
        if "kandy" in fl or "kandy" in tl:
            return [{"routeName": "Route A (Colombo - Kandy Road A01 via Ambepussa & Kadugannawa Pass)", "distanceKm": 121, "estimatedMinutes": 160, "notes": "Highway A01"}]
        return [{"routeName": "Route A (Colombo - Katunayake Expressway E03 via Peliyagoda)", "distanceKm": 38,
                 "estimatedMinutes": 45, "notes": "Expressway E03"}]


# ── Tool 5: get_weather ──────────────────────────────────────────────────────
def tool_get_weather(location: str) -> dict:
    """Get real weather from OpenWeatherMap via ASP.NET Core WeatherController."""
    try:
        resp = requests.get(
            f"{WEATHER_BASE}/logistics",
            params={"from": location, "to": "Colombo"},
            timeout=8
        )
        resp.raise_for_status()
        data = resp.json()
        # Normalise to what the logistics agent expects
        fw = data.get("fromWeather", {})
        return {
            "condition":    fw.get("condition",    "Unknown"),
            "rainExpected": fw.get("rainExpected", False),
            "drivingRisk":  data.get("overallDrivingRisk", "Low"),
            "bufferMinutes": data.get("recommendedBufferMinutes", 0),
            "note":         data.get("advice", ""),
            "source":       data.get("source", "Unknown"),
        }
    except Exception as e:
        print(f"[tool_get_weather] {e}")
        return {"condition": "Unknown", "rainExpected": False,
                "drivingRisk": "Unknown", "note": "Weather data unavailable"}


# ── Tool 6: calculate_eta ────────────────────────────────────────────────────
def tool_calculate_eta(
    pickup_time_str: str,
    travel_minutes: int,
    rain_expected: bool,
    rain_window: str = ""
) -> dict:
    """
    Calculate ETA given pickup time + travel time + weather.
    Adds 20min buffer if rain expected on route.
    """
    from datetime import datetime, timedelta
    try:
        pickup_dt = datetime.strptime(pickup_time_str, "%H:%M")
        extra     = 20 if rain_expected else 0
        total_min = travel_minutes + extra
        eta_dt    = pickup_dt + timedelta(minutes=total_min)
        return {
            "pickupTime":       pickup_time_str,
            "travelMinutes":    travel_minutes,
            "weatherBuffer":    extra,
            "totalMinutes":     total_min,
            "estimatedETA":     eta_dt.strftime("%H:%M"),
            "note": f"+{extra} min weather buffer" if extra > 0 else "No weather delay",
        }
    except Exception as e:
        return {"pickupTime": pickup_time_str, "estimatedETA": "Unknown",
                "totalMinutes": travel_minutes, "note": str(e)}


# ── POST delivery plan to DB ──────────────────────────────────────────────────
def save_delivery_plan(plan_data: dict) -> dict | None:
    """Save the AI-generated delivery plan to the DB via .NET API."""
    try:
        resp = requests.post(
            f"{LOGISTICS_BASE}/plans",
            json=plan_data,
            timeout=5
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"[save_delivery_plan] {e}")
        return None


# ── Main Logistics Agent function ─────────────────────────────────────────────
def run_logistics_agent(req: "WorkflowRequest", recommended_price: float) -> dict:
    """
    Logistics Scheduling Agent — 6 tools, multi-step reasoning.

    Steps:
      1. tool_get_available_vehicles()  → find suitable vehicle
      2. tool_get_available_drivers()   → find available driver
      3. tool_get_cold_storage()        → find cold storage
      4. tool_get_route()               → get route options
      5. tool_get_weather()             → check weather
      6. tool_calculate_eta()           → compute pickup + ETA
      → save_delivery_plan()            → save to DB
    """
    qty    = req.quantity_kg
    pickup = getattr(req, 'pickup_location',  'Negombo')
    dest   = getattr(req, 'delivery_location', 'Colombo')
    print(f"\n[LogisticsAgent] Planning delivery for catch #{req.catch_id} "
          f"({qty}kg {req.fish_species}) from {pickup} to {dest}")

    reasoning: list[str] = []

    # ── Step 1: Vehicles ──────────────────────────────────────────────────────
    print("  [Tool 1] get_available_vehicles()")
    vehicles = tool_get_available_vehicles(qty)

    if not vehicles:
        return {"status": "partial", "reason": "No available vehicles with sufficient capacity."}

    # Pick vehicle with smallest sufficient capacity (minimize waste)
    best_vehicle = min(vehicles, key=lambda v: float(v.get("capacityKg", 999999)))
    reasoning.append(
        f"✓ Vehicle {best_vehicle['vehicleCode']} selected "
        f"({best_vehicle['capacityKg']}kg capacity, "
        f"currently at {best_vehicle.get('currentLocation','?')})"
    )
    print(f"    → Selected: {best_vehicle['vehicleCode']}")

    # ── Step 2: Drivers ───────────────────────────────────────────────────────
    print("  [Tool 2] get_available_drivers()")
    drivers = tool_get_available_drivers()

    if not drivers:
        reasoning.append("⚠️ No available drivers — using vehicle's default driver")
        best_driver = {
            "driverCode": "D01", "fullName": best_vehicle.get("driverName", "Default"),
            "availableFrom": "06:00", "availableTo": "18:00"
        }
    else:
        best_driver = drivers[0]
        reasoning.append(
            f"✓ Driver {best_driver['driverCode']} ({best_driver['fullName']}) "
            f"available {best_driver.get('availableFrom','?')}–{best_driver.get('availableTo','?')}"
        )
    print(f"    → Driver: {best_driver['driverCode']}")

    # ── Step 3: Cold Storage ──────────────────────────────────────────────────
    print("  [Tool 3] get_cold_storage()")
    storages = tool_get_cold_storage(qty)

    if storages:
        best_storage = storages[0]  # coldest available
        reasoning.append(
            f"✓ Cold storage {best_storage['storageCode']} "
            f"({best_storage['name']}, {best_storage['temperatureCelsius']}°C, "
            f"available: {best_storage['totalCapacityKg'] - best_storage['usedCapacityKg']}kg)"
        )
        print(f"    → Storage: {best_storage['storageCode']}")
    else:
        best_storage = {"storageCode": "C02", "name": "Default Cold Store",
                        "temperatureCelsius": 4, "totalCapacityKg": 1000, "usedCapacityKg": 0}
        reasoning.append("⚠️ Using default cold storage — verify availability")

    # ── Step 4: Route ─────────────────────────────────────────────────────────
    print("  [Tool 4] get_route()")
    routes = tool_get_route(pickup, dest)

    # Step 5: Weather — needed before choosing route ──────────────────────────
    print("  [Tool 5] get_weather()")
    weather = tool_get_weather(pickup)
    rain_expected = weather.get("rainExpected", False)
    weather_note  = weather.get("note", "")

    # Choose best route considering weather
    if len(routes) >= 2 and rain_expected:
        # Pick alternate route when rain expected on primary
        selected_route = routes[1]
        reasoning.append(
            f"⚠️ Rain expected ({weather.get('rainWindow','?')}) — "
            f"selected {selected_route['routeName']} (lower flood risk)"
        )
    else:
        fl = (pickup or "").lower()
        tl = (delivery or "").lower()
        default_route = {
            "routeName": "Route A (Central Expressway E04 & Kurunegala - Anuradhapura Highway A28)", "distanceKm": 205, "estimatedMinutes": 270
        } if ("anuradhapura" in fl or "anuradhapura" in tl) else {
            "routeName": "Route A (Colombo - Katunayake Expressway E03 via Peliyagoda)", "distanceKm": 38, "estimatedMinutes": 45
        }
        selected_route = routes[0] if routes else default_route
        if rain_expected:
            reasoning.append(f"⚠️ Rain expected but only one route available — allow extra time")
        else:
            reasoning.append(f"✓ {selected_route['routeName']} — good driving conditions")

    print(f"    → Route: {selected_route['routeName']}")

    # ── Step 6: Calculate ETA ─────────────────────────────────────────────────
    print("  [Tool 6] calculate_eta()")
    # Default pickup: 1 hour from now (Sri Lanka time)
    from datetime import datetime, timedelta, timezone as tz
    sl_now      = datetime.now(tz.utc) + timedelta(hours=5, minutes=30)
    pickup_dt   = sl_now + timedelta(hours=1)
    pickup_str  = pickup_dt.strftime("%H:%M")

    eta_result = tool_calculate_eta(
        pickup_str,
        int(selected_route.get("estimatedMinutes", 90)),
        rain_expected,
        weather.get("rainWindow", "")
    )
    reasoning.append(
        f"✓ Pickup: {pickup_str} → ETA: {eta_result['estimatedETA']} "
        f"({eta_result['totalMinutes']} min total"
        f"{', +20 min rain buffer' if rain_expected else ''})"
    )
    print(f"    → ETA: {eta_result['estimatedETA']}")

    # ── Build delivery plan ───────────────────────────────────────────────────
    full_reasoning = "\n".join(reasoning)
    plan_payload = {
        "catchId":          req.catch_id,
        "vehicleCode":      best_vehicle["vehicleCode"],
        "driverCode":       best_driver["driverCode"],
        "coldStorageCode":  best_storage["storageCode"],
        "pickupLocation":   pickup,
        "deliveryLocation": dest,
        "selectedRoute":    selected_route["routeName"],
        "distanceKm":       selected_route.get("distanceKm", 0),
        "estimatedMinutes": eta_result["totalMinutes"],
        "pickupTime":       pickup_dt.isoformat(),
        "estimatedETA":     (pickup_dt + timedelta(minutes=eta_result["totalMinutes"])).isoformat(),
        "agentReasoning":   full_reasoning,
        "weatherNote":      weather_note,
        "status":           "PendingApproval",
    }

    # Save to DB
    saved_plan = save_delivery_plan(plan_payload)
    plan_id    = saved_plan.get("planId", "N/A") if saved_plan else "Save failed"

    return {
        "status": "success",
        "plan": {
            "planId":            plan_id,
            "vehicleCode":       best_vehicle["vehicleCode"],
            "vehicleCapacity":   best_vehicle["capacityKg"],
            "driverCode":        best_driver["driverCode"],
            "driverName":        best_driver.get("fullName", ""),
            "coldStorageCode":   best_storage["storageCode"],
            "storageTemp":       best_storage["temperatureCelsius"],
            "selectedRoute":     selected_route["routeName"],
            "distanceKm":        selected_route.get("distanceKm", 0),
            "estimatedMinutes":  eta_result["totalMinutes"],
            "pickupTime":        pickup_str,
            "etaTime":           eta_result["estimatedETA"],
            "weatherNote":       weather_note,
            "reasoning":         full_reasoning,
        }
    }


# ══════════════════════════════════════════════════════════════════════════════
# TOOL FUNCTIONS  (Agent calls these to gather information)
# ══════════════════════════════════════════════════════════════════════════════

def tool_get_catch_details(catch_id: int) -> dict | None:
    """Tool: fetch full catch record from DB."""
    try:
        resp = requests.get(f"{ASP_NET}/api/Catches/{catch_id}", timeout=5)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"[tool_get_catch_details] {e}")
        return None


def tool_get_market_price(species: str) -> dict | None:
    """Tool: get current market price stats for a species from price_api + DB."""
    try:
        encoded = requests.utils.quote(species)
        resp = requests.get(f"{PRICE_API_URL}/{encoded}/predict", timeout=5)
        resp.raise_for_status()
        data = resp.json()
        return {
            "source":           "price_api",
            "avgLast30":        data.get("summary", {}).get("avgLast30", 0),
            "recommendedPrice": data.get("recommendedPrice", 0),
            "trendPct":         data.get("summary", {}).get("trendPct", 0),
        }
    except Exception as e:
        print(f"[tool_get_market_price] {e}")
        return None


def tool_get_seller_history(fisherman_id: int) -> dict:
    """Tool: fetch seller's fraud/quality history from DB."""
    try:
        resp = requests.get(f"{ASP_NET}/api/Catches/seller-history/{fisherman_id}", timeout=5)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"[tool_get_seller_history] {e}")
        return {"sellerRisk": "Unknown", "previousFraudFlags": 0, "totalCatches": 0,
                "highFraudCount": 0, "mediumFraudCount": 0, "avgQualityScore": 0}


def tool_get_transaction_history(catch_id: int) -> dict:
    """Tool: check for suspicious bid patterns on this catch."""
    try:
        resp = requests.get(f"{ASP_NET}/api/Bids/catch/{catch_id}", timeout=5)
        resp.raise_for_status()
        bids = resp.json()
        total    = len(bids)
        # Detect duplicate bids from same buyer
        buyer_counts = {}
        for b in bids:
            bid = b.get("buyerId", 0)
            buyer_counts[bid] = buyer_counts.get(bid, 0) + 1
        duplicate_bids = sum(1 for v in buyer_counts.values() if v > 1)
        return {"totalBids": total, "duplicateBidCount": duplicate_bids,
                "suspicious": duplicate_bids > 0}
    except Exception as e:
        print(f"[tool_get_transaction_history] {e}")
        return {"totalBids": 0, "duplicateBidCount": 0, "suspicious": False}


def send_status_update(workflow_id: str, agent: str, status: str, summary: str):
    try:
        requests.post(ASP_NET_API_URL, json={
            "workflowId": workflow_id,
            "agent":      agent,
            "status":     status,
            "summary":    summary,
        }, timeout=5)
    except Exception as e:
        print(f"[webhook] {e}")


# ══════════════════════════════════════════════════════════════════════════════
# AGENT 2 — FRAUD & QUALITY VALIDATION AGENT
# ══════════════════════════════════════════════════════════════════════════════

class ValidationResult:
    """Structured result from the Fraud & Quality Validation Agent."""
    def __init__(self):
        self.checks:               list[str]  = []
        self.warnings:             list[str]  = []
        self.fraud_risk:           str        = "Low"
        self.quality_score:        int        = 0
        self.requires_admin_review: bool      = False
        self.recommended_status:   str        = "Published"
        self.weight_discrepancy_pct: float    = 0.0
        self.final_status:         str        = "VERIFIED"

    def add_check(self, label: str, passed: bool, detail: str = ""):
        icon = "✅" if passed else "⚠️"
        self.checks.append(f"{icon} {label}" + (f": {detail}" if detail else ""))

    def add_warning(self, msg: str):
        self.warnings.append(f"⚠️ {msg}")
        print(f"  [WARN] {msg}")

    def to_summary(self) -> str:
        lines = ["=== FRAUD & QUALITY VALIDATION REPORT ===", ""]
        lines += self.checks
        if self.warnings:
            lines += ["", "--- Warnings ---"] + self.warnings
        lines += [
            "",
            f"Fraud Risk:   {self.fraud_risk.upper()}",
            f"Quality Score: {self.quality_score}/100",
            f"Final Status: {self.final_status}",
        ]
        if self.requires_admin_review:
            lines.append("🚨 REQUIRES ADMIN REVIEW")
        return "\n".join(lines)


def run_quality_validation_agent(req: WorkflowRequest) -> ValidationResult:
    """
    Multi-step Fraud & Quality Validation Agent.

    Tools used:
      1. tool_get_catch_details()       → get full catch record
      2. tool_get_market_price()        → get current market price
      3. tool_get_seller_history()      → get seller fraud/quality history
      4. tool_get_transaction_history() → check for suspicious bid patterns

    Steps:
      Step 1 — Weight Verification Check
      Step 2 — Quality & Inspection Check
      Step 3 — Price Anomaly Check
      Step 4 — Seller History Check
      Step 5 — Transaction Pattern Check
      Step 6 — Aggregate Risk Calculation
    """

    result = ValidationResult()
    print(f"\n[QualityAgent] Starting validation for catch #{req.catch_id}")

    # ── Call tools to gather all data ─────────────────────────────────────────
    print("  [Tool] get_catch_details()")
    catch = tool_get_catch_details(req.catch_id)

    print("  [Tool] get_market_price()")
    market = tool_get_market_price(req.fish_species)

    print("  [Tool] get_seller_history()")
    seller = tool_get_seller_history(req.fisherman_id)

    print("  [Tool] get_transaction_history()")
    txn = tool_get_transaction_history(req.catch_id)

    # ── Step 1: Weight Verification ───────────────────────────────────────────
    declared  = req.quantity_kg
    verified  = req.verified_weight_kg if req.verified_weight_kg > 0 else 0

    if verified <= 0:
        result.add_check("Weight Check", True, f"Declared {declared}kg — no verified weight yet")
        result.weight_discrepancy_pct = 0
    else:
        diff_kg  = abs(declared - verified)
        diff_pct = (diff_kg / declared * 100) if declared > 0 else 0
        result.weight_discrepancy_pct = round(diff_pct, 1)

        if diff_pct <= WEIGHT_DIFF_WARNING_PCT:
            result.add_check("Weight Check", True,
                f"Declared {declared}kg | Verified {verified}kg | Diff {diff_pct:.1f}% — PASS")
        elif diff_pct <= WEIGHT_DIFF_HIGH_PCT:
            result.add_check("Weight Check", False,
                f"Declared {declared}kg | Verified {verified}kg | Diff {diff_pct:.1f}% — WARNING")
            result.add_warning(f"{diff_pct:.1f}% weight discrepancy ({diff_kg:.1f}kg difference)")
            result.fraud_risk = "Medium"
        else:
            result.add_check("Weight Check", False,
                f"Declared {declared}kg | Verified {verified}kg | Diff {diff_pct:.1f}% — HIGH RISK")
            result.add_warning(f"SIGNIFICANT weight mismatch: {diff_pct:.1f}% ({diff_kg:.1f}kg)")
            result.fraud_risk = "High"
            result.requires_admin_review = True

    # ── Step 2: Quality & Inspection Check ───────────────────────────────────
    grade      = req.declared_quality_grade.strip().upper() if req.declared_quality_grade else ""
    inspection = req.inspection_result.strip()

    grade_score = {"A+": 95, "A": 85, "B": 70, "C": 50}.get(grade, 60)

    if inspection == "Passed" and grade in ("A+", "A", "B", "C"):
        result.add_check("Quality Check", True,
            f"Grade {grade} | Inspection: {inspection} — PASS")
        result.quality_score = grade_score

    elif inspection == "Failed":
        result.add_check("Quality Check", False,
            f"Grade {grade} | Inspection: FAILED")
        result.add_warning("Inspection failed — manual review required")
        result.quality_score = max(0, grade_score - 30)
        result.requires_admin_review = True
        if result.fraud_risk == "Low":
            result.fraud_risk = "Medium"

    elif inspection == "Pending":
        result.add_check("Quality Check", True,
            f"Grade {grade if grade else 'Not set'} | Inspection: Pending")
        result.quality_score = grade_score if grade else 50

    else:
        result.add_check("Quality Check", True,
            f"Grade {grade if grade else '—'} | Inspection: {inspection}")
        result.quality_score = grade_score

    # ── Step 3: Price Anomaly Check ───────────────────────────────────────────
    if market and market.get("avgLast30", 0) > 0:
        market_avg  = market["avgLast30"]
        asking      = req.asking_price
        price_diff  = ((asking - market_avg) / market_avg * 100) if market_avg > 0 else 0

        if price_diff > PRICE_ANOMALY_HIGH_PCT:
            result.add_check("Price Check", False,
                f"Rs.{asking}/kg vs market Rs.{market_avg}/kg — {price_diff:.0f}% above market")
            result.add_warning(f"Unusual price: Rs.{asking}/kg is {price_diff:.0f}% above market average")
            if result.fraud_risk != "High":
                result.fraud_risk = "Medium"
            result.requires_admin_review = True

        elif price_diff > PRICE_ANOMALY_WARNING_PCT:
            result.add_check("Price Check", False,
                f"Rs.{asking}/kg vs market Rs.{market_avg}/kg — {price_diff:.0f}% above market (warning)")
            result.add_warning(f"Price {price_diff:.0f}% above market — review recommended")
            if result.fraud_risk == "Low":
                result.fraud_risk = "Medium"

        elif price_diff < -30:
            result.add_check("Price Check", True,
                f"Rs.{asking}/kg — {abs(price_diff):.0f}% below market (good deal for buyer)")

        else:
            result.add_check("Price Check", True,
                f"Rs.{asking}/kg vs market Rs.{market_avg}/kg — within normal range")
    else:
        result.add_check("Price Check", True, "No market data available — skipped")

    # ── Step 4: Seller History Check ──────────────────────────────────────────
    seller_risk    = seller.get("sellerRisk", "Unknown")
    fraud_flags    = seller.get("previousFraudFlags", 0)
    total_catches  = seller.get("totalCatches", 0)
    avg_quality    = seller.get("avgQualityScore", 0)

    if seller_risk == "Good" or total_catches == 0:
        result.add_check("Seller History", True,
            f"Risk: {seller_risk} | {total_catches} previous catches | "
            f"{fraud_flags} fraud flags | Avg quality: {avg_quality}")

    elif seller_risk == "Moderate":
        result.add_check("Seller History", False,
            f"Risk: Moderate | {fraud_flags} previous fraud flag(s)")
        result.add_warning(f"Seller has {fraud_flags} previous fraud flag(s)")
        if result.fraud_risk == "Low":
            result.fraud_risk = "Medium"

    else:  # Poor
        result.add_check("Seller History", False,
            f"Risk: POOR | {fraud_flags} fraud flags — HIGH RISK SELLER")
        result.add_warning(f"High-risk seller: {fraud_flags} previous fraud flags")
        result.fraud_risk = "High"
        result.requires_admin_review = True

    # ── Step 5: Transaction Pattern Check ────────────────────────────────────
    if txn.get("suspicious"):
        dup = txn.get("duplicateBidCount", 0)
        result.add_check("Transaction Check", False,
            f"Suspicious pattern: {dup} duplicate bid(s) detected")
        result.add_warning(f"Suspicious transaction pattern: {dup} duplicate bid(s)")
        if result.fraud_risk == "Low":
            result.fraud_risk = "Medium"
    else:
        result.add_check("Transaction Check", True,
            f"{txn.get('totalBids', 0)} bids — no suspicious patterns")

    # ── Step 6: Aggregate Risk & Final Status ─────────────────────────────────
    if result.fraud_risk == "High" or result.requires_admin_review:
        result.final_status         = "REQUIRES_ADMIN_REVIEW"
        result.recommended_status   = "Draft"   # hold — don't publish
        result.requires_admin_review = True
    elif result.fraud_risk == "Medium":
        result.final_status       = "VERIFIED_WITH_WARNINGS"
        result.recommended_status = "Published"  # publish but flag in admin
        result.requires_admin_review = True
    else:
        result.final_status       = "VERIFIED"
        result.recommended_status = "Published"

    print(f"  [QualityAgent] Result: {result.fraud_risk} risk | {result.final_status}")
    return result


# ══════════════════════════════════════════════════════════════════════════════
# MARKET INTELLIGENCE HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def get_price_prediction(species: str) -> dict | None:
    try:
        encoded = requests.utils.quote(species)
        resp = requests.get(f"{PRICE_API_URL}/{encoded}/predict", timeout=5)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"[price_api] {e}")
        return None


def get_db_market_stats(species: str) -> dict | None:
    try:
        resp = requests.get(MARKET_STATS_URL, timeout=5)
        resp.raise_for_status()
        for stat in resp.json():
            if stat.get("species", "").lower() == species.lower():
                return stat
        return None
    except Exception as e:
        print(f"[db stats] {e}")
        return None


def compute_final_recommendation(
    species: str, asking_price: float,
    prediction: dict | None, db_stat: dict | None
) -> tuple[float, str]:
    has_pred = prediction is not None and prediction.get("recommendedPrice", 0) > 0
    has_db   = db_stat   is not None and db_stat.get("catchCount", 0) > 0

    if has_pred and has_db:
        api_price = prediction["recommendedPrice"]
        db_price  = db_stat["recommendedPrice"]
        blended   = round(api_price * 0.6 + db_price * 0.4, 2)
        trend     = prediction.get("summary", {}).get("trendPct", 0)
        next7     = prediction.get("next7Days", [])
        hi = max((d["predictedPrice"] for d in next7), default=blended)
        lo = min((d["predictedPrice"] for d in next7), default=blended)
        return blended, (
            f"[Hybrid] Rs.{api_price} (model) + Rs.{db_price} (DB) → Rs.{blended}/kg. "
            f"Trend {trend:+.1f}%. 7-day range Rs.{lo}–Rs.{hi}/kg."
        )
    elif has_pred:
        rec = prediction["recommendedPrice"]
        return rec, f"[Price API] Rs.{rec}/kg. {prediction.get('insight','')}"
    elif has_db:
        rec = db_stat["recommendedPrice"]
        return rec, f"[DB] Avg Rs.{db_stat['avgPriceLast30']}/kg → Recommended Rs.{rec}/kg."
    else:
        rec = round(asking_price * 1.05, 2)
        return rec, f"[Fallback] Rs.{rec}/kg (5% above asking)."


# ══════════════════════════════════════════════════════════════════════════════
# BUYER MATCHING HELPERS
# ══════════════════════════════════════════════════════════════════════════════

CITY_COORDS: dict[str, tuple[float, float]] = {
    "colombo":  (6.9271, 79.8612), "negombo":  (7.2083, 79.8358),
    "kandy":    (7.2906, 80.6337), "galle":    (6.0535, 80.2210),
    "jaffna":   (9.6615, 80.0255), "matara":   (5.9549, 80.5550),
}


def _haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1); dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlon/2)**2
    return R * 2 * math.asin(math.sqrt(a))


def get_available_catches(token: str | None = None) -> list[dict]:
    try:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        resp = requests.get(AVAILABLE_CATCHES, headers=headers, timeout=5)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"[available catches] {e}")
        return []


def score_catch(catch: dict, pref: BuyerMatchRequest) -> dict:
    score = 0; reasons = []
    if not pref.species:
        score += 20; reasons.append("~ No species preference set")
    elif catch["fishSpecies"].lower() == pref.species.lower():
        score += 40; reasons.append("✓ Exact species match")
    elif pref.species.lower() in catch["fishSpecies"].lower() or catch["fishSpecies"].lower() in pref.species.lower():
        score += 38; reasons.append("✓ Species match")
    else:
        reasons.append(f"✗ Species: {catch['fishSpecies']} (wanted {pref.species})")
    qty = float(catch["quantityKg"])
    if pref.min_quantity_kg <= qty <= pref.max_quantity_kg:
        score += 25; reasons.append(f"✓ {qty}kg fits range")
    elif qty > pref.max_quantity_kg:
        score += 12; reasons.append(f"~ {qty}kg — partial possible")
    else:
        score += 5; reasons.append(f"✗ Only {qty}kg")
    asking = float(catch["askingPricePerKg"])
    if asking <= pref.max_price_per_kg:
        pct = (pref.max_price_per_kg - asking) / pref.max_price_per_kg * 100 if pref.max_price_per_kg else 0
        score += 20 if pct >= 15 else 15 if pct >= 5 else 10
        reasons.append(f"✓ Rs.{asking}/kg within budget")
    else:
        reasons.append(f"✗ Rs.{asking}/kg over budget")
    loc = catch.get("location", ""); city = (pref.preferred_city or "").lower()
    if not city:
        score += 5; reasons.append("~ No location preference")
    elif city in loc.lower():
        score += 10; reasons.append(f"✓ In {city.title()}")
    else:
        reasons.append(f"~ Location: {loc}")
    q = int(catch.get("qualityScore", 0))
    if q >= 90: score += 5; reasons.append("✓ Premium quality")
    elif q >= 70: score += 3; reasons.append("✓ Good quality")
    score = min(score, 100)
    return {**catch, "matchScore": score, "matchReasons": " · ".join(reasons)}


def run_buyer_matching(catches, pref):
    scored = [score_catch(c, pref) for c in catches]
    return sorted([c for c in scored if c["matchScore"] >= 30],
                  key=lambda x: x["matchScore"], reverse=True)[:10]


# ══════════════════════════════════════════════════════════════════════════════
# MAIN AGENTIC WORKFLOW
# ══════════════════════════════════════════════════════════════════════════════

def run_agentic_workflow(req: WorkflowRequest):
    """
    Full 5-agent workflow:
    1. Planning
    2. Fraud & Quality Validation  ← REAL multi-step analysis
    3. Market Intelligence         ← REAL price model
    4. Buyer Matching              ← REAL preference scoring
    5. Logistics Scheduling        ← REAL 6-tool delivery planning
    """

    # ── 1. Planning ───────────────────────────────────────────────────────────
    send_status_update(req.workflow_id, "Planning", "InProgress",
        f"Initialising workflow for {req.fish_species} ({req.quantity_kg}kg). "
        f"Calling Quality, Market and Buyer Matching agents.")
    time.sleep(1)

    # ── 2. Fraud & Quality Validation ─────────────────────────────────────────
    send_status_update(req.workflow_id, "QualityValidation", "InProgress",
        f"Running multi-step fraud & quality analysis for catch #{req.catch_id}. "
        f"Calling tools: catch_details, market_price, seller_history, transaction_history...")
    time.sleep(1)

    validation = run_quality_validation_agent(req)
    summary    = validation.to_summary()

    # Post validation result back to .NET DB
    try:
        requests.post(VALIDATE_URL, json={
            "catchId":              req.catch_id,
            "fraudRisk":            validation.fraud_risk,
            "weightDiscrepancyPct": validation.weight_discrepancy_pct,
            "qualityScore":         validation.quality_score,
            "validationSummary":    summary,
            "requiresAdminReview":  validation.requires_admin_review,
            "recommendedStatus":    validation.recommended_status,
        }, timeout=5)
        print(f"  [QualityAgent] Validation result saved to DB.")
    except Exception as e:
        print(f"  [QualityAgent] Failed to save result: {e}")

    if validation.requires_admin_review:
        risk_msg = (
            f"⚠️ REQUIRES ADMIN REVIEW — Fraud Risk: {validation.fraud_risk.upper()}\n"
            f"{summary}"
        )
        send_status_update(req.workflow_id, "QualityValidation", "PendingApproval", risk_msg)
        send_status_update(req.workflow_id, "AdminApproval", "PendingApproval",
            f"🚨 Catch #{req.catch_id} flagged by Quality Agent. "
            f"Fraud Risk: {validation.fraud_risk.upper()}. "
            f"Warnings: {'; '.join(validation.warnings)}. "
            f"Awaiting Admin review.")
        # Workflow pauses here — admin must approve/reject
        return
    else:
        send_status_update(req.workflow_id, "QualityValidation", "Success",
            f"✅ {validation.final_status} | Fraud Risk: {validation.fraud_risk} | "
            f"Quality Score: {validation.quality_score}/100\n{summary}")
    time.sleep(1)

    # ── 3. Market Intelligence ────────────────────────────────────────────────
    send_status_update(req.workflow_id, "MarketIntelligence", "InProgress",
        f"Querying price model and DB history for {req.fish_species}...")
    time.sleep(1)
    prediction        = get_price_prediction(req.fish_species)
    db_stat           = get_db_market_stats(req.fish_species)
    recommended_price, market_insight = compute_final_recommendation(
        req.fish_species, req.asking_price, prediction, db_stat
    )
    send_status_update(req.workflow_id, "MarketIntelligence", "Success", market_insight)
    time.sleep(1)

    # ── 4. Buyer Matching ─────────────────────────────────────────────────────
    send_status_update(req.workflow_id, "BuyerMatching", "InProgress",
        f"Scoring buyers against {req.fish_species} ({req.quantity_kg}kg)...")
    time.sleep(1)
    catches = get_available_catches()
    pref    = BuyerMatchRequest(
        species          = req.fish_species,
        min_quantity_kg  = req.quantity_kg * 0.5,
        max_quantity_kg  = req.quantity_kg * 2.0,
        max_price_per_kg = recommended_price * 1.1,
    )
    matches = run_buyer_matching(catches, pref)
    match_msg = (
        f"Found {len(matches)} match(es). "
        f"Top: {matches[0]['fishSpecies']} {matches[0]['quantityKg']}kg "
        f"@ Rs.{matches[0]['askingPricePerKg']}/kg ({matches[0]['matchScore']}%)"
        if matches else "No direct buyer matches — listing open for bidding."
    )
    send_status_update(req.workflow_id, "BuyerMatching", "Success", match_msg)
    time.sleep(1)

    # ── 5. Logistics ──────────────────────────────────────────────────────────
    send_status_update(req.workflow_id, "Logistics", "InProgress",
        f"Running Logistics Scheduling Agent for {req.fish_species} ({req.quantity_kg}kg)..."
        f" Calling tools: vehicles, drivers, cold_storage, route, weather, eta...")
    time.sleep(1)

    logistics_plan = run_logistics_agent(req, recommended_price)

    if logistics_plan.get("status") == "success":
        plan = logistics_plan["plan"]
        send_status_update(req.workflow_id, "Logistics", "Success",
            f"✅ Delivery Plan Created:\n"
            f"Vehicle: {plan['vehicleCode']} ({plan['vehicleCapacity']}kg capacity)\n"
            f"Driver: {plan['driverCode']} — {plan['driverName']}\n"
            f"Cold Storage: {plan['coldStorageCode']} ({plan['storageTemp']}°C)\n"
            f"Route: {plan['selectedRoute']}\n"
            f"Distance: {plan['distanceKm']}km | ETA: {plan['estimatedMinutes']} min\n"
            f"Pickup: {plan['pickupTime']} | ETA: {plan['etaTime']}\n"
            f"Weather: {plan['weatherNote']}\n"
            f"Plan ID: {plan.get('planId', 'Pending')} — PENDING ADMIN APPROVAL")
    else:
        send_status_update(req.workflow_id, "Logistics", "Success",
            f"⚠️ Partial logistics plan: {logistics_plan.get('reason', 'Limited resources available')}"
            f" — Admin review required.")

    # ── Final ─────────────────────────────────────────────────────────────────
    vehicle_info = logistics_plan["plan"]["vehicleCode"] if logistics_plan.get("status") == "success" else "TBD"
    send_status_update(req.workflow_id, "AdminApproval", "PendingApproval",
        f"✅ AI workflow complete. "
        f"Fraud Risk: {validation.fraud_risk} | Quality: {validation.quality_score}/100 | "
        f"Recommended: Rs.{recommended_price}/kg | Buyer Matches: {len(matches)} | "
        f"Vehicle: {vehicle_info} | Awaiting Admin Approval.")


# ══════════════════════════════════════════════════════════════════════════════
# HTTP ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/api/workflow/start")
async def start_workflow(req: WorkflowRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(run_agentic_workflow, req)
    return {"status": "Workflow started", "workflow_id": req.workflow_id}


@app.post("/api/buyer-match")
async def buyer_match(pref: BuyerMatchRequest):
    catches = get_available_catches()
    if not catches:
        return {"preferences": pref.dict(), "totalAvailable": 0, "recommendations": []}
    return {
        "preferences":     pref.dict(),
        "totalAvailable":  len(catches),
        "recommendations": run_buyer_matching(catches, pref),
    }


@app.post("/api/logistics/plan")
async def create_logistics_plan(req: LogisticsRequest, background_tasks: BackgroundTasks):
    """
    Standalone Logistics Scheduling Agent endpoint.
    Can be called directly (e.g. after a bid is accepted).
    Runs the full 6-tool logistics agent and saves plan to DB.
    """
    background_tasks.add_task(_run_logistics_background, req)
    return {"status": "Logistics agent started", "workflow_id": req.workflow_id}


def _run_logistics_background(req: LogisticsRequest):
    if req.weight_kg is not None:
        req.quantity_kg = req.weight_kg
    if not req.workflow_id:
        req.workflow_id = f"WF-LOG-{req.catch_id}"

    send_status_update(req.workflow_id, "Logistics", "InProgress",
        f"Running Logistics Scheduling Agent for {req.fish_species} "
        f"({req.quantity_kg}kg) from {req.pickup_location} to {req.delivery_location}...")

    # Create a WorkflowRequest-compatible object
    class _Req:
        def __init__(self, r):
            self.workflow_id       = r.workflow_id
            self.catch_id          = r.catch_id
            self.quantity_kg       = r.quantity_kg
            self.fish_species      = r.fish_species
            self.pickup_location   = r.pickup_location
            self.delivery_location = r.delivery_location

    result = run_logistics_agent(_Req(req), 0)

    if result.get("status") == "success":
        plan = result["plan"]
        send_status_update(req.workflow_id, "Logistics", "PendingApproval",
            f"📋 Delivery Plan Created — PENDING ADMIN APPROVAL\n"
            f"Vehicle: {plan['vehicleCode']} | Driver: {plan['driverCode']}\n"
            f"Cold Storage: {plan['coldStorageCode']} ({plan['storageTemp']}°C)\n"
            f"Route: {plan['selectedRoute']} ({plan['distanceKm']}km)\n"
            f"Pickup: {plan['pickupTime']} → ETA: {plan['etaTime']}\n"
            f"Weather: {plan['weatherNote']}\n\n"
            f"Reasoning:\n{plan['reasoning']}")
    else:
        send_status_update(req.workflow_id, "Logistics", "Success",
            f"⚠️ {result.get('reason', 'Logistics planning incomplete')}")


@app.get("/health")
def health():
    price_ok = dotnet_ok = False
    try: price_ok  = requests.get("http://localhost:8001/health", timeout=2).ok
    except: pass
    try: dotnet_ok = requests.get(f"{ASP_NET}/health", timeout=5).ok
    except: pass
    return {
        "status":     "AI Agent running",
        "price_api":  "connected" if price_ok  else "unreachable",
        "dotnet_api": "connected" if dotnet_ok else "unreachable",
    }
