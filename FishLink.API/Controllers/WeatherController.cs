using FishLink.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FishLink.API.Controllers;

/// <summary>
/// Weather API — wraps OpenWeatherMap and provides weather context for:
///   - Logistics Agent: route and timing decisions
///   - Fisherman dashboard: safety alerts
///   - Admin: operational monitoring
///
/// Third-party: OpenWeatherMap (https://openweathermap.org)
/// Routes external calls through ASP.NET Core (mandatory backend rule).
/// Credentials stored in appsettings / environment variables — never exposed to clients.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class WeatherController : ControllerBase
{
    private readonly IWeatherService _weather;
    private readonly ILogger<WeatherController> _logger;

    public WeatherController(IWeatherService weather, ILogger<WeatherController> logger)
    {
        _weather = weather;
        _logger  = logger;
    }

    /// GET /api/Weather/current?location=Negombo
    /// Returns current weather for a Sri Lanka fishing/logistics location.
    [HttpGet("current")]
    [AllowAnonymous]
    public async Task<IActionResult> GetCurrentWeather([FromQuery] string location = "Negombo")
    {
        if (string.IsNullOrWhiteSpace(location))
            return BadRequest("location parameter is required.");

        _logger.LogInformation("Weather request for {Location}", location);
        var result = await _weather.GetWeatherAsync(location);
        return Ok(result);
    }

    /// GET /api/Weather/fishing-safety?location=Negombo
    /// Returns a simplified fishing safety assessment for fishermen.
    [HttpGet("fishing-safety")]
    [AllowAnonymous]
    public async Task<IActionResult> GetFishingSafety([FromQuery] string location = "Negombo")
    {
        var w = await _weather.GetWeatherAsync(location);
        return Ok(new
        {
            location      = w.Location,
            condition     = w.Condition,
            tempCelsius   = w.TempCelsius,
            windSpeedKmh  = w.WindSpeedKmh,
            fishingRisk   = w.FishingRisk,
            isSafeToFish  = w.FishingRisk == "Low",
            iconUrl       = w.IconUrl,
            advice        = w.FishingRisk switch
            {
                "High"     => "⚠️ Dangerous conditions — do not go to sea.",
                "Moderate" => "⚠️ Caution advised — check local authorities before heading out.",
                _          => "✅ Conditions are suitable for fishing.",
            },
            source        = w.Source,
            fetchedAt     = w.FetchedAt,
        });
    }

    /// GET /api/Weather/logistics?from=Negombo&to=Colombo
    /// Returns weather-based logistics advisory for a delivery route.
    [HttpGet("logistics")]
    [AllowAnonymous]
    public async Task<IActionResult> GetLogisticsWeather(
        [FromQuery] string from = "Negombo",
        [FromQuery] string to   = "Colombo")
    {
        // Fetch weather for both ends of the journey
        var fromWeather = await _weather.GetWeatherAsync(from);
        var toWeather   = await _weather.GetWeatherAsync(to);

        // Overall risk = worst of the two
        var overallRisk = (fromWeather.DrivingRisk, toWeather.DrivingRisk) switch
        {
            ("High",     _)          => "High",
            (_,          "High")     => "High",
            ("Moderate", _)          => "Moderate",
            (_,          "Moderate") => "Moderate",
            _                        => "Low",
        };

        var bufferMinutes = overallRisk switch
        {
            "High"     => 40,
            "Moderate" => 20,
            _          => 0,
        };

        return Ok(new
        {
            from          = from,
            to            = to,
            fromWeather   = new { fromWeather.Condition, fromWeather.TempCelsius,
                                  fromWeather.WindSpeedKmh, fromWeather.DrivingRisk,
                                  fromWeather.RainExpected },
            toWeather     = new { toWeather.Condition, toWeather.TempCelsius,
                                  toWeather.WindSpeedKmh, toWeather.DrivingRisk,
                                  toWeather.RainExpected },
            overallDrivingRisk = overallRisk,
            recommendedBufferMinutes = bufferMinutes,
            advice        = overallRisk switch
            {
                "High"     => "⚠️ Severe weather — consider postponing delivery or using alternate route.",
                "Moderate" => $"⚠️ Allow +{bufferMinutes} min buffer. Monitor road conditions.",
                _          => "✅ Good driving conditions for delivery.",
            },
            source        = fromWeather.Source,
            fetchedAt     = DateTime.UtcNow,
        });
    }

    /// GET /api/Weather/locations
    /// Returns supported Sri Lanka fishing locations with weather summaries.
    [HttpGet("locations")]
    public async Task<IActionResult> GetAllLocationsWeather()
    {
        var locations = new[] { "Negombo", "Colombo", "Galle", "Jaffna", "Matara" };

        var tasks   = locations.Select(l => _weather.GetWeatherAsync(l));
        var results = await Task.WhenAll(tasks);

        return Ok(results.Select(r => new
        {
            r.Location,
            r.Condition,
            r.TempCelsius,
            r.WindSpeedKmh,
            r.FishingRisk,
            r.DrivingRisk,
            r.RainExpected,
            r.IconUrl,
            r.Source,
        }));
    }
}
