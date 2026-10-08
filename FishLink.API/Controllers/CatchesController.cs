using FishLink.API.DTOs;
using FishLink.API.Models;
using FishLink.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace FishLink.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[IgnoreAntiforgeryToken]
[Authorize]
public class CatchesController : ControllerBase
{
    private readonly ICatchService _service;

    public CatchesController(ICatchService service) => _service = service;

    // ── GET /api/Catches?page=1&pageSize=10&search=tuna&species=Tuna&status=Published&sortBy=price&sortOrder=asc
    [HttpGet]
    [AllowAnonymous]
    public async Task<IActionResult> GetCatches([FromQuery] CatchQueryParams query)
    {
        var result = await _service.GetCatchesAsync(query);
        return Ok(result);
    }

    // ── GET /api/Catches/{id}
    [HttpGet("{id}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetCatch(int id)
    {
        var c = await _service.GetByIdAsync(id);
        return c == null ? NotFound($"Catch {id} not found.") : Ok(c);
    }

    // ── GET /api/Catches/market-stats
    [HttpGet("market-stats")]
    [AllowAnonymous]
    public async Task<IActionResult> GetMarketStats()
        => Ok(await _service.GetMarketStatsAsync());

    // ── GET /api/Catches/flagged
    [HttpGet("flagged")]
    [Authorize]
    public async Task<IActionResult> GetFlaggedCatches()
        => Ok(await _service.GetFlaggedAsync());

    // ── GET /api/Catches/seller-history/{fishermanId}
    [HttpGet("seller-history/{fishermanId}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetSellerHistory(int fishermanId)
    {
        var history = await _service.GetSellerHistoryAsync(fishermanId);
        return Ok(history);
    }

    // ── POST /api/Catches
    [HttpPost]
    [Authorize(Roles = "Fisherman,Buyer,Admin")]
    public async Task<IActionResult> CreateCatch([FromBody] CatchRequest req)
    {
        var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        var c = await _service.CreateAsync(req, userId);
        return CreatedAtAction(nameof(GetCatch), new { id = c.Id }, c);
    }

    // ── PUT /api/Catches/{id}
    [HttpPut("{id}")]
    [Authorize(Roles = "Fisherman,Buyer,Admin")]
    public async Task<IActionResult> UpdateCatch(int id, [FromBody] CatchRequest req)
    {
        var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        var isAdmin = User.FindFirst(ClaimTypes.Role)?.Value == "Admin";
        await _service.UpdateAsync(id, req, userId, isAdmin);
        return NoContent();
    }

    // ── PATCH /api/Catches/{id}/publish
    [HttpPatch("{id}/publish")]
    [Authorize(Roles = "Fisherman,Buyer,Admin")]
    public async Task<IActionResult> PublishCatch(int id)
    {
        var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        var isAdmin = User.FindFirst(ClaimTypes.Role)?.Value == "Admin";
        await _service.PublishAsync(id, userId, isAdmin);
        return Ok(new { message = "Listing published successfully.", status = "Published" });
    }

    // ── PATCH /api/Catches/{id}/cancel
    [HttpPatch("{id}/cancel")]
    [Authorize(Roles = "Fisherman,Buyer,Admin")]
    public async Task<IActionResult> CancelCatch(int id)
    {
        var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        var isAdmin = User.FindFirst(ClaimTypes.Role)?.Value == "Admin";
        await _service.CancelAsync(id, userId, isAdmin);
        return Ok(new { message = "Listing cancelled.", status = "Cancelled" });
    }

    // ── DELETE /api/Catches/{id}
    [HttpDelete("{id}")]
    [Authorize(Roles = "Fisherman,Buyer,Admin")]
    public async Task<IActionResult> DeleteCatch(int id)
    {
        var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        var isAdmin = User.FindFirst(ClaimTypes.Role)?.Value == "Admin";
        await _service.DeleteAsync(id, userId, isAdmin);
        return NoContent();
    }

    // ── POST /api/Catches/validate  (called by AI agent via ASP.NET — not directly from client)
    [HttpPost("validate")]
    [AllowAnonymous]
    public async Task<IActionResult> ReceiveValidationResult([FromBody] ValidationResultRequest result)
    {
        await _service.ReceiveValidationResultAsync(result);
        return Ok(new { message = "Validation result saved.", catchId = result.CatchId,
                        fraudRisk = result.FraudRisk });
    }

    // ── PATCH /api/Catches/{id}/admin-approve
    [HttpPatch("{id}/admin-approve")]
    [Authorize]
    public async Task<IActionResult> AdminApproveCatch(int id)
    {
        await _service.AdminApproveAsync(id);
        return Ok(new { message = "Catch approved and published.", status = "Published" });
    }

    // ── PATCH /api/Catches/{id}/admin-reject
    [HttpPatch("{id}/admin-reject")]
    [Authorize]
    public async Task<IActionResult> AdminRejectCatch(int id)
    {
        await _service.AdminRejectAsync(id);
        return Ok(new { message = "Catch rejected and cancelled.", status = "Cancelled" });
    }
}
