using FishLink.API.Data;
using FishLink.API.Models;
using FishLink.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FishLink.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class LogisticsController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly IWeatherService      _weather;
    private readonly ILogger<LogisticsController> _logger;

    public LogisticsController(
        ApplicationDbContext context,
        IWeatherService weather,
        ILogger<LogisticsController> logger)
    {
        _context = context;
        _weather = weather;
        _logger  = logger;
    }

    // ── Tool endpoints (called by AI Agent & Dashboard) ─────────────────────

    /// GET /api/Logistics/vehicles — all vehicles
    [HttpGet("vehicles")]
    [AllowAnonymous]
    public async Task<IActionResult> GetAllVehicles()
    {
        var vehicles = await _context.Vehicles
            .OrderBy(v => v.VehicleCode)
            .ToListAsync();
        return Ok(vehicles);
    }

    /// GET /api/Logistics/vehicles/available?capacityKg=100
    [HttpGet("vehicles/available")]
    [AllowAnonymous]
    public async Task<IActionResult> GetAvailableVehicles([FromQuery] decimal capacityKg = 0)
    {
        var vehicles = await _context.Vehicles
            .Where(v => v.Status == "Available" &&
                        (capacityKg == 0 || v.CapacityKg >= capacityKg))
            .OrderBy(v => v.CapacityKg)
            .ToListAsync();
        return Ok(vehicles);
    }

    /// GET /api/Logistics/drivers — all drivers
    [HttpGet("drivers")]
    [AllowAnonymous]
    public async Task<IActionResult> GetAllDrivers()
    {
        var drivers = await _context.Drivers
            .OrderBy(d => d.DriverCode)
            .ToListAsync();
        return Ok(drivers);
    }

    /// GET /api/Logistics/drivers/available
    [HttpGet("drivers/available")]
    [AllowAnonymous]
    public async Task<IActionResult> GetAvailableDrivers()
    {
        var drivers = await _context.Drivers
            .Where(d => d.Status == "Available")
            .OrderBy(d => d.DriverCode)
            .ToListAsync();
        return Ok(drivers);
    }

    /// GET /api/Logistics/storage — all cold storage
    [HttpGet("storage")]
    [AllowAnonymous]
    public async Task<IActionResult> GetAllColdStorage()
    {
        var storages = await _context.ColdStorages
            .OrderBy(s => s.StorageCode)
            .ToListAsync();
        return Ok(storages);
    }

    /// GET /api/Logistics/storage/available?capacityKg=100
    [HttpGet("storage/available")]
    [AllowAnonymous]
    public async Task<IActionResult> GetAvailableColdStorage([FromQuery] decimal capacityKg = 0)
    {
        var storages = await _context.ColdStorages
            .Where(s => s.Status == "Available" &&
                        (capacityKg == 0 || (s.TotalCapacityKg - s.UsedCapacityKg) >= capacityKg))
            .OrderBy(s => s.TemperatureCelsius)
            .ToListAsync();
        return Ok(storages);
    }

    /// GET /api/Logistics/route?from=Negombo&to=Colombo
    /// Returns route options with distance + estimated time.
    /// Uses hardcoded Sri Lanka city pairs (no external Maps API needed).
    [HttpGet("route")]
    [AllowAnonymous]
    public IActionResult GetRoute([FromQuery] string from, [FromQuery] string to)
    {
        var routes = BuildRoutes(from?.ToLower() ?? "", to?.ToLower() ?? "");
        return Ok(new { from, to, routes });
    }

    /// GET /api/Logistics/weather?location=Negombo
    /// Returns real weather via OpenWeatherMap (or simulation fallback).
    [HttpGet("weather")]
    [AllowAnonymous]
    public async Task<IActionResult> GetWeather([FromQuery] string location = "Negombo")
    {
        _logger.LogInformation("Logistics weather request for {Location}", location);
        var result = await _weather.GetWeatherAsync(location);
        return Ok(result);
    }

    // ── Delivery Plan CRUD ────────────────────────────────────────────────────

    private (string route, decimal km, int mins) GetRouteDetails(string? pickup, string? delivery)
    {
        var p = ExtractCity(pickup ?? "");
        var d = ExtractCity(delivery ?? "");

        if ((p.Contains("anuradhapura") && d.Contains("colombo")) || (p.Contains("colombo") && d.Contains("anuradhapura")))
            return ("Route A (Central Expressway E04 & Kurunegala - Anuradhapura Highway A28)", 205m, 270);

        if ((p.Contains("anuradhapura") && d.Contains("kandy")) || (p.Contains("kandy") && d.Contains("anuradhapura")))
            return ("Route A (Kandy - Jaffna Highway A09 via Dambulla)", 138m, 195);

        if ((p.Contains("beruwala") && d.Contains("kandy")) || (p.Contains("kandy") && d.Contains("beruwala")))
            return ("Route A (Southern Expressway E01 ➔ Central Expressway E04 to Kandy)", 155m, 175);

        if (p.Contains("galle") || d.Contains("galle"))
            return ("Route A (Southern Expressway E01 via Kottawa Interchange)", 118m, 95);

        if (p.Contains("kandy") || d.Contains("kandy"))
            return ("Route A (Colombo - Kandy Road A01 via Ambepussa & Kadugannawa Pass)", 121m, 160);

        if (p.Contains("beruwala") || d.Contains("beruwala"))
            return ("Route A (Southern Expressway E01 via Dodangoda Interchange)", 62m, 55);

        if (p.Contains("matara") || d.Contains("matara"))
            return ("Route A (Southern Expressway E01 via Godagama & Kottawa)", 158m, 125);

        if (p.Contains("hambantota") || d.Contains("hambantota") || p.Contains("tangalle") || d.Contains("tangalle"))
            return ("Route A (Southern Expressway E01 via Mattala & Kottawa)", 225m, 165);

        if (p.Contains("jaffna") || d.Contains("jaffna"))
            return ("Route A (Kandy - Jaffna Highway A09 via Dambulla & Vavuniya)", 395m, 410);

        if (p.Contains("trinco") || d.Contains("trinco"))
            return ("Route A (Ambepussa - Trincomalee Highway A06 via Habarana & Kantale)", 257m, 300);

        if (p.Contains("batticaloa") || d.Contains("batticaloa"))
            return ("Route A (Colombo - Batticaloa Highway A04 / A11 via Polonnaruwa)", 315m, 360);

        if (p.Contains("puttalam") || d.Contains("puttalam") || p.Contains("kalpitiya") || d.Contains("kalpitiya"))
            return ("Route A (Colombo - Puttalam Road A03 via Chilaw & Kochchikade)", 140m, 190);

        if (p.Contains("mannar") || d.Contains("mannar"))
            return ("Route A (Medawachchiya - Talaimannar Highway A14 / A03)", 310m, 340);

        return ("Route A (Colombo - Katunayake Expressway E03 via Peliyagoda)", 38m, 45);
    }

    private string ResolveDetailedRoute(string? currentRoute, string? pickup, string? delivery)
    {
        var details = GetRouteDetails(pickup, delivery);
        var p = (pickup ?? "").ToLower();
        var d = (delivery ?? "").ToLower();

        // If route is generic, direct, or erroneously assigned Katunayake for Anuradhapura/Kandy/Galle/etc., resolve to proper highway!
        if (string.IsNullOrWhiteSpace(currentRoute) ||
            currentRoute.Equals("Route A", StringComparison.OrdinalIgnoreCase) ||
            currentRoute.Equals("Route A (Direct)", StringComparison.OrdinalIgnoreCase) ||
            currentRoute.Equals("Route A (Direct Highway)", StringComparison.OrdinalIgnoreCase) ||
            (currentRoute.Contains("Katunayake") && (p.Contains("anuradhapura") || d.Contains("anuradhapura") || p.Contains("kandy") || d.Contains("kandy") || p.Contains("galle") || d.Contains("galle") || p.Contains("beruwala") || d.Contains("beruwala") || p.Contains("jaffna") || d.Contains("jaffna"))))
        {
            return details.route;
        }

        return currentRoute;
    }

    /// POST /api/Logistics/plans — AI Agent creates a plan
    [HttpPost("plans")]
    [AllowAnonymous]   // AI agent calls this
    public async Task<IActionResult> CreateDeliveryPlan([FromBody] DeliveryPlan plan)
    {
        plan.CreatedAt     = DateTime.UtcNow;
        plan.UpdatedAt     = DateTime.UtcNow;
        plan.Status        = "PendingApproval";
        plan.PlanId        = $"PLAN-{plan.CatchId}-{DateTime.UtcNow:HHmmss}";

        var details = GetRouteDetails(plan.PickupLocation, plan.DeliveryLocation);
        plan.SelectedRoute = ResolveDetailedRoute(plan.SelectedRoute, plan.PickupLocation, plan.DeliveryLocation);

        // Sanitize distance and duration if default or under-estimated
        if (plan.DistanceKm <= 50 && details.km > 50)
        {
            plan.DistanceKm = details.km;
            plan.EstimatedMinutes = details.mins;
            if (plan.PickupTime.HasValue)
            {
                plan.EstimatedETA = plan.PickupTime.Value.AddMinutes(details.mins);
            }
        }

        _context.DeliveryPlans.Add(plan);
        await _context.SaveChangesAsync();
        return Ok(plan);
    }

    /// GET /api/Logistics/plans — all plans (admin & logistics)
    [HttpGet("plans")]
    [AllowAnonymous]
    public async Task<IActionResult> GetPlans()
    {
        var plans = await _context.DeliveryPlans
            .OrderByDescending(p => p.CreatedAt)
            .ToListAsync();

        bool modified = false;
        foreach (var p in plans)
        {
            var details = GetRouteDetails(p.PickupLocation, p.DeliveryLocation);
            var detailed = ResolveDetailedRoute(p.SelectedRoute, p.PickupLocation, p.DeliveryLocation);
            if (p.SelectedRoute != detailed)
            {
                p.SelectedRoute = detailed;
                modified = true;
            }

            // Fix distance, duration and arrival ETA if under-estimated
            var pCity = ExtractCity(p.PickupLocation);
            var dCity = ExtractCity(p.DeliveryLocation);
            if (pCity == "anuradhapura" || dCity == "anuradhapura")
            {
                p.DistanceKm = details.km;
                p.EstimatedMinutes = details.mins;
                p.SelectedRoute = details.route;
                if (p.PickupTime.HasValue)
                {
                    p.EstimatedETA = p.PickupTime.Value.AddMinutes(details.mins);
                }
                modified = true;
            }
            else if ((pCity == "jaffna" || dCity == "jaffna") && (p.DistanceKm < 300 || p.EstimatedMinutes < 350))
            {
                p.DistanceKm = details.km;
                p.EstimatedMinutes = details.mins;
                p.SelectedRoute = details.route;
                if (p.PickupTime.HasValue)
                {
                    p.EstimatedETA = p.PickupTime.Value.AddMinutes(details.mins);
                }
                modified = true;
            }
            else if ((pCity == "trincomalee" || dCity == "trincomalee") && (p.DistanceKm < 200 || p.EstimatedMinutes < 240))
            {
                p.DistanceKm = details.km;
                p.EstimatedMinutes = details.mins;
                p.SelectedRoute = details.route;
                if (p.PickupTime.HasValue)
                {
                    p.EstimatedETA = p.PickupTime.Value.AddMinutes(details.mins);
                }
                modified = true;
            }
            else if (((pCity == "beruwala" && dCity == "kandy") || (pCity == "kandy" && dCity == "beruwala")) && (p.DistanceKm < 100 || p.EstimatedMinutes < 120))
            {
                p.DistanceKm = details.km;
                p.EstimatedMinutes = details.mins;
                p.SelectedRoute = details.route;
                if (p.PickupTime.HasValue)
                {
                    p.EstimatedETA = p.PickupTime.Value.AddMinutes(details.mins);
                }
                modified = true;
            }
        }
        if (modified)
        {
            await _context.SaveChangesAsync();
        }

        return Ok(plans);
    }

    /// GET /api/Logistics/plans/pending — plans awaiting admin approval
    [HttpGet("plans/pending")]
    [AllowAnonymous]
    public async Task<IActionResult> GetPendingPlans()
    {
        var plans = await _context.DeliveryPlans
            .Where(p => p.Status == "PendingApproval")
            .OrderByDescending(p => p.CreatedAt)
            .ToListAsync();

        bool modified = false;
        foreach (var p in plans)
        {
            var details = GetRouteDetails(p.PickupLocation, p.DeliveryLocation);
            var detailed = ResolveDetailedRoute(p.SelectedRoute, p.PickupLocation, p.DeliveryLocation);
            if (p.SelectedRoute != detailed)
            {
                p.SelectedRoute = detailed;
                modified = true;
            }

            var pCity = ExtractCity(p.PickupLocation);
            var dCity = ExtractCity(p.DeliveryLocation);
            if ((pCity == "anuradhapura" || dCity == "anuradhapura") && (p.DistanceKm < 150 || p.EstimatedMinutes < 200))
            {
                p.DistanceKm = details.km;
                p.EstimatedMinutes = details.mins;
                p.SelectedRoute = details.route;
                if (p.PickupTime.HasValue)
                {
                    p.EstimatedETA = p.PickupTime.Value.AddMinutes(details.mins);
                }
                modified = true;
            }
        }
        if (modified)
        {
            await _context.SaveChangesAsync();
        }

        return Ok(plans);
    }

    /// GET /api/Logistics/plans/catch/{catchId}
    [HttpGet("plans/catch/{catchId}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetPlanForCatch(int catchId)
    {
        var plan = await _context.DeliveryPlans
            .Where(p => p.CatchId == catchId)
            .OrderByDescending(p => p.CreatedAt)
            .FirstOrDefaultAsync();
        if (plan == null) return NotFound("No delivery plan for this catch.");

        var detailed = ResolveDetailedRoute(plan.SelectedRoute, plan.PickupLocation, plan.DeliveryLocation);
        if (plan.SelectedRoute != detailed)
        {
            plan.SelectedRoute = detailed;
            await _context.SaveChangesAsync();
        }

        return Ok(plan);
    }

    /// PATCH /api/Logistics/plans/{id}/approve
    [HttpPatch("plans/{id}/approve")]
    [Authorize]
    public async Task<IActionResult> ApprovePlan(int id, [FromBody] ApproveRequest? req = null)
    {
        var plan = await _context.DeliveryPlans.FindAsync(id);
        if (plan == null) return NotFound();

        plan.Status    = "Scheduled";
        plan.AdminNote = req?.Note ?? string.Empty;
        plan.UpdatedAt = DateTime.UtcNow;

        // Mark vehicle and driver as Busy
        var vehicle = await _context.Vehicles.FirstOrDefaultAsync(v => v.VehicleCode == plan.VehicleCode);
        if (vehicle != null) { vehicle.Status = "Busy"; vehicle.UpdatedAt = DateTime.UtcNow; }

        var driver = await _context.Drivers.FirstOrDefaultAsync(d => d.DriverCode == plan.DriverCode);
        if (driver != null) { driver.Status = "Busy"; driver.UpdatedAt = DateTime.UtcNow; }

        // Reserve cold storage
        if (!string.IsNullOrEmpty(plan.ColdStorageCode))
        {
            var storage = await _context.ColdStorages
                .FirstOrDefaultAsync(s => s.StorageCode == plan.ColdStorageCode);
            if (storage != null)
            {
                var catchRecord = await _context.Catches.FindAsync(plan.CatchId);
                if (catchRecord != null)
                    storage.UsedCapacityKg += catchRecord.QuantityKg;
                storage.UpdatedAt = DateTime.UtcNow;
            }
        }

        await _context.SaveChangesAsync();
        return Ok(new { message = "Delivery plan approved and scheduled.", planId = plan.PlanId, status = plan.Status });
    }

    /// PATCH /api/Logistics/plans/{id}/reject
    [HttpPatch("plans/{id}/reject")]
    [Authorize]
    public async Task<IActionResult> RejectPlan(int id, [FromBody] ApproveRequest? req = null)
    {
        var plan = await _context.DeliveryPlans.FindAsync(id);
        if (plan == null) return NotFound();

        plan.Status    = "Rejected";
        plan.AdminNote = req?.Note ?? string.Empty;
        plan.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return Ok(new { message = "Delivery plan rejected.", planId = plan.PlanId });
    }

    /// PATCH /api/Logistics/plans/{id}/dispatch — mark vehicle dispatched with departure time
    [HttpPatch("plans/{id}/dispatch")]
    [Authorize]
    public async Task<IActionResult> DispatchPlan(int id, [FromBody] DispatchRequest? req = null)
    {
        var plan = await _context.DeliveryPlans.FindAsync(id);
        if (plan == null) return NotFound();

        plan.Status    = "InTransit";
        plan.PickupTime = req?.DepartureTime ?? DateTime.UtcNow;
        if (req?.EstimatedETA != null) plan.EstimatedETA = req.EstimatedETA;
        if (!string.IsNullOrEmpty(req?.AdminNote)) plan.AdminNote = req.AdminNote;
        plan.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return Ok(new { message = "Reefer vehicle dispatched and in transit.", planId = plan.PlanId, status = plan.Status });
    }

    /// PATCH /api/Logistics/plans/{id}/complete — mark delivery done
    [HttpPatch("plans/{id}/complete")]
    [Authorize]
    public async Task<IActionResult> CompletePlan(int id)
    {
        var plan = await _context.DeliveryPlans.FindAsync(id);
        if (plan == null) return NotFound();
        plan.Status    = "Delivered";
        plan.UpdatedAt = DateTime.UtcNow;

        // Free up vehicle + driver
        var vehicle = await _context.Vehicles.FirstOrDefaultAsync(v => v.VehicleCode == plan.VehicleCode);
        if (vehicle != null) { vehicle.Status = "Available"; vehicle.UpdatedAt = DateTime.UtcNow; }
        var driver = await _context.Drivers.FirstOrDefaultAsync(d => d.DriverCode == plan.DriverCode);
        if (driver != null) { driver.Status = "Available"; driver.TotalDeliveries++; driver.UpdatedAt = DateTime.UtcNow; }

        await _context.SaveChangesAsync();
        return Ok(new { message = "Delivery marked complete.", planId = plan.PlanId });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static string ExtractCity(string location)
    {
        if (string.IsNullOrWhiteSpace(location)) return "colombo";
        var l = location.ToLower();
        if (l.Contains("anuradhapura")) return "anuradhapura";
        if (l.Contains("negombo")) return "negombo";
        if (l.Contains("peliyagoda") || l.Contains("colombo")) return "colombo";
        if (l.Contains("galle")) return "galle";
        if (l.Contains("beruwala")) return "beruwala";
        if (l.Contains("kandy")) return "kandy";
        if (l.Contains("matara")) return "matara";
        if (l.Contains("jaffna")) return "jaffna";
        if (l.Contains("trincomalee")) return "trincomalee";
        if (l.Contains("batticaloa")) return "batticaloa";
        if (l.Contains("hambantota") || l.Contains("tangalle")) return "hambantota";
        if (l.Contains("puttalam") || l.Contains("kalpitiya")) return "puttalam";
        if (l.Contains("mannar")) return "mannar";
        if (l.Contains("kalutara")) return "kalutara";
        return l.Trim().Split(new[] { ' ', ',', '-' }, StringSplitOptions.RemoveEmptyEntries)[0];
    }

    private static List<object> BuildRoutes(string from, string to)
    {
        var f = ExtractCity(from);
        var t = ExtractCity(to);
        var key = $"{f}→{t}";

        return key switch
        {
            "anuradhapura→colombo" or "colombo→anuradhapura" => new List<object> {
                new { routeName="Route A (Central Expressway E04 & Kurunegala - Anuradhapura Highway A28)", distanceKm=205, estimatedMinutes=270, notes="High-capacity inland corridor via Central Expressway E04" },
                new { routeName="Route B (Puttalam - Colombo Road A03 via Chilaw & Padeniya)", distanceKm=218, estimatedMinutes=330, notes="Northwestern coastal highway A03" },
            },
            "anuradhapura→kandy" or "kandy→anuradhapura" => new List<object> {
                new { routeName="Route A (Kandy - Jaffna Highway A09 via Dambulla)", distanceKm=138, estimatedMinutes=195, notes="Central arterial highway A09" },
                new { routeName="Route B (Via Matale & Galewela)", distanceKm=142, estimatedMinutes=225, notes="Scenic highland route" },
            },
            "negombo→colombo" or "colombo→negombo" => new List<object> {
                new { routeName="Route A (Colombo - Katunayake Expressway E03 via Peliyagoda)", distanceKm=38, estimatedMinutes=45, notes="Expressway E03 — fastest cold-chain corridor" },
                new { routeName="Route B (Negombo - Colombo Main Road A03 via Ja-Ela & Wattala)", distanceKm=42, estimatedMinutes=75, notes="Urban highway — moderate congestion" },
            },
            "negombo→kandy" or "kandy→negombo" => new List<object> {
                new { routeName="Route A (Colombo - Kandy Road A01 via Ambepussa & Kadugannawa Pass)", distanceKm=121, estimatedMinutes=160, notes="Main arterial highway A01" },
                new { routeName="Route B (Central Expressway E04 via Mirigama & Kurunegala)", distanceKm=115, estimatedMinutes=135, notes="Expressway corridor E04" },
            },
            "galle→colombo" or "colombo→galle" => new List<object> {
                new { routeName="Route A (Southern Expressway E01 via Kottawa Interchange)", distanceKm=118, estimatedMinutes=95, notes="High-speed expressway E01" },
                new { routeName="Route B (Galle Road A02 Coastal Corridor via Kalutara)", distanceKm=126, estimatedMinutes=190, notes="Coastal road A02 with traffic signals" },
            },
            "beruwala→colombo" or "colombo→beruwala" => new List<object> {
                new { routeName="Route A (Southern Expressway E01 via Dodangoda Interchange)", distanceKm=62, estimatedMinutes=55, notes="Expressway transit" },
                new { routeName="Route B (Galle Road A02 via Kalutara & Panadura)", distanceKm=56, estimatedMinutes=90, notes="Coastal A02" },
            },
            "beruwala→kandy" or "kandy→beruwala" => new List<object> {
                new { routeName="Route A (Southern Expressway E01 ➔ Central Expressway E04 to Kandy)", distanceKm=155, estimatedMinutes=175, notes="Combined expressways E01 + E04" },
                new { routeName="Route B (Galle Road A02 ➔ Colombo-Kandy Road A01)", distanceKm=168, estimatedMinutes=240, notes="Urban arterial route" },
            },
            "matara→colombo" or "colombo→matara" => new List<object> {
                new { routeName="Route A (Southern Expressway E01 via Godagama & Kottawa)", distanceKm=158, estimatedMinutes=125, notes="Expressway E01" },
                new { routeName="Route B (Galle Road A02 Coastal Highway)", distanceKm=165, estimatedMinutes=240, notes="Coastal highway" },
            },
            "hambantota→colombo" or "colombo→hambantota" => new List<object> {
                new { routeName="Route A (Southern Expressway E01 via Mattala & Kottawa)", distanceKm=225, estimatedMinutes=165, notes="High-speed Southern Expressway E01" },
                new { routeName="Route B (Tangalle - Matara Coastal A02)", distanceKm=235, estimatedMinutes=290, notes="Coastal A02 corridor" },
            },
            "jaffna→colombo" or "colombo→jaffna" => new List<object> {
                new { routeName="Route A (Kandy - Jaffna Highway A09 via Dambulla & Vavuniya)", distanceKm=395, estimatedMinutes=410, notes="Northern highway A09" },
                new { routeName="Route B (Puttalam - Jaffna Road A32 via Mannar)", distanceKm=380, estimatedMinutes=440, notes="Northwestern coastal A32" },
            },
            "trincomalee→colombo" or "colombo→trincomalee" => new List<object> {
                new { routeName="Route A (Ambepussa - Trincomalee Highway A06 via Habarana & Kantale)", distanceKm=257, estimatedMinutes=300, notes="Eastern highway A06" },
                new { routeName="Route B (Via Dambulla & Kurunegala)", distanceKm=265, estimatedMinutes=330, notes="Alternate highway" },
            },
            "puttalam→colombo" or "colombo→puttalam" => new List<object> {
                new { routeName="Route A (Colombo - Puttalam Road A03 via Chilaw & Kochchikade)", distanceKm=140, estimatedMinutes=190, notes="Arterial coastal highway A03" },
                new { routeName="Route B (Via Katunayake Expressway E03 & Negombo)", distanceKm=148, estimatedMinutes=200, notes="Expressway connected route" },
            },
            "batticaloa→colombo" or "colombo→batticaloa" => new List<object> {
                new { routeName="Route A (Colombo - Batticaloa Highway A04 / A11 via Polonnaruwa)", distanceKm=315, estimatedMinutes=360, notes="Eastern highway corridor" },
                new { routeName="Route B (Via Badulla & Mahiyanganaya)", distanceKm=330, estimatedMinutes=420, notes="Mountain route" },
            },
            _ => new List<object> {
                new { routeName=$"Route A ({from} to {to} Primary Expressway/Highway)", distanceKm=80, estimatedMinutes=110, notes="Fastest primary corridor" },
                new { routeName=$"Route B ({from} to {to} Secondary Arterial Road)", distanceKm=95, estimatedMinutes=150, notes="Alternate route" },
            }
        };
    }

    private static object SimulateWeather(string location)
    {
        // Deterministic simulation based on current hour
        var hour = DateTime.UtcNow.AddHours(5.5).Hour; // Sri Lanka time
        var isRainy = hour >= 14 && hour <= 17;         // afternoon rain common in SL

        return new
        {
            location,
            condition       = isRainy ? "Heavy Rain" : "Clear",
            temperatureCelsius = isRainy ? 27 : 32,
            windSpeedKmh    = isRainy ? 25 : 10,
            rainExpected    = isRainy,
            rainWindow      = isRainy ? $"{hour:D2}:00 – {hour + 2:D2}:00" : "None",
            drivingRisk     = isRainy ? "Moderate — allow extra 20 min" : "Low",
            note            = isRainy
                ? "Rain expected. Consider Route B with lower flood risk."
                : "Good driving conditions.",
            source          = "Simulated (replace with OpenWeatherMap API)",
        };
    }
}

public class ApproveRequest
{
    public string? Note { get; set; }
}

public class DispatchRequest
{
    public DateTime? DepartureTime { get; set; }
    public DateTime? EstimatedETA { get; set; }
    public string? AdminNote { get; set; }
}
