using FishLink.API.Data;
using FishLink.API.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace FishLink.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class BidsController : ControllerBase
{
    private readonly ApplicationDbContext _context;

    public BidsController(ApplicationDbContext context)
    {
        _context = context;
    }

    [HttpGet("catch/{catchId}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetBidsForCatch(int catchId)
    {
        var bids = await _context.Bids
            .Include(b => b.Buyer)
            .Where(b => b.CatchId == catchId)
            .ToListAsync();
        
        return Ok(bids);
    }

    [HttpPost]
    [Authorize(Roles = "Buyer,Fisherman,Admin")]
    public async Task<IActionResult> PlaceBid([FromBody] Bid newBid)
    {
        var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value!);
        newBid.BuyerId = userId;
        newBid.BidTime = DateTime.UtcNow;
        newBid.Status = "Pending";

        var fishCatch = await _context.Catches.FindAsync(newBid.CatchId);
        if (fishCatch == null) return NotFound("Catch not found");

        if (newBid.BidPricePerKg <= 0)
            return BadRequest("Bid price must be greater than Rs. 0/kg.");

        // Enforce: Only one bid per buyer per catch
        var existingBid = await _context.Bids
            .FirstOrDefaultAsync(b => b.CatchId == newBid.CatchId && b.BuyerId == userId && b.Status != "Cancelled");
        if (existingBid != null)
            return BadRequest($"You have already placed a bid of Rs. {existingBid.BidPricePerKg:0.00}/kg on this catch. Each buyer can only place one bid.");

        _context.Bids.Add(newBid);
        await _context.SaveChangesAsync();

        // Update catch status to Bidding
        fishCatch.Status = "Bidding";
        await _context.SaveChangesAsync();

        // Update the Agent Workflow State + call AI webhook
        var workflow = await _context.AgentWorkflows.FirstOrDefaultAsync(w => w.CatchId == fishCatch.Id);
        if (workflow != null)
        {
            workflow.CurrentAgent = "BuyerMatching";
            workflow.LastUpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            // Call Python AI agent webhook
            try
            {
                using var http = new System.Net.Http.HttpClient { Timeout = TimeSpan.FromSeconds(5) };
                await http.PostAsJsonAsync("http://localhost:8000/api/workflow/start", new
                {
                    workflow_id  = workflow.WorkflowId,
                    catch_id     = fishCatch.Id,
                    fisherman_id = fishCatch.FishermanId,
                    quantity_kg  = (double)fishCatch.QuantityKg,
                    asking_price = (double)fishCatch.AskingPricePerKg,
                    fish_species = fishCatch.FishSpecies,
                });
            }
            catch { /* AI agent offline — non-blocking */ }
        }

        return CreatedAtAction(nameof(GetBidsForCatch), new { catchId = newBid.CatchId }, newBid);
    }

    [HttpGet("my")]
    public async Task<IActionResult> GetMyBids()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (userIdClaim == null) return Unauthorized();
        var userId = int.Parse(userIdClaim);

        var bids = await _context.Bids
            .Include(b => b.Catch)
            .Where(b => b.BuyerId == userId)
            .OrderByDescending(b => b.BidTime)
            .Select(b => new
            {
                b.Id,
                b.CatchId,
                b.BidPricePerKg,
                b.BidTime,
                b.Status,
                Species = b.Catch != null ? b.Catch.FishSpecies : "Unknown",
                QuantityKg = b.Catch != null ? b.Catch.QuantityKg : 0,
                Location = b.Catch != null ? b.Catch.Location : "",
                AskingPrice = b.Catch != null ? b.Catch.AskingPricePerKg : 0,
                QualityGrade = b.Catch != null ? (b.Catch.QualityScore >= 85 ? "A" : b.Catch.QualityScore >= 70 ? "B" : "C") : "A",
                CurrentHighest = _context.Bids.Where(x => x.CatchId == b.CatchId).Max(x => (decimal?)x.BidPricePerKg) ?? b.BidPricePerKg,
            })
            .ToListAsync();

        return Ok(bids);
    }

    // ── GET /api/Bids/my-orders ────────────────────────────────────────────────
    [HttpGet("my-orders")]
    public async Task<IActionResult> GetMyOrders()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (userIdClaim == null) return Unauthorized();
        var userId = int.Parse(userIdClaim);

        // Ensure any accepted bids without an order record have one created
        var acceptedBids = await _context.Bids
            .Include(b => b.Catch)
            .Where(b => b.BuyerId == userId && b.Status == "Accepted")
            .ToListAsync();

        foreach (var b in acceptedBids)
        {
            var exists = await _context.Orders.AnyAsync(o => o.BidId == b.Id);
            if (!exists)
            {
                var total = b.BidPricePerKg * (b.Catch?.QuantityKg ?? 1);
                _context.Orders.Add(new Order
                {
                    BidId = b.Id,
                    TotalAmount = total,
                    Status = "Created",
                    CreatedAt = DateTime.UtcNow
                });
            }
        }
        await _context.SaveChangesAsync();

        var orders = await _context.Orders
            .Include(o => o.Bid)
                .ThenInclude(b => b!.Catch)
            .Where(o => o.Bid != null && o.Bid.BuyerId == userId)
            .OrderByDescending(o => o.CreatedAt)
            .ToListAsync();

        var catchIds = orders.Select(o => o.Bid?.CatchId ?? 0).Where(id => id > 0).Distinct().ToList();
        var plans = await _context.DeliveryPlans
            .Where(p => catchIds.Contains(p.CatchId))
            .ToListAsync();

        var result = orders.Select(o =>
        {
            var plan = plans.FirstOrDefault(p => p.CatchId == o.Bid?.CatchId || p.BidId == o.BidId);
            var fishCatch = o.Bid?.Catch;
            var totalKg = fishCatch?.QuantityKg ?? 1;
            var pricePerKg = o.Bid?.BidPricePerKg ?? 0;

            return new
            {
                orderId = o.Id,
                orderCode = $"ORD-{o.Id:D5}",
                bidId = o.BidId,
                catchId = o.Bid?.CatchId,
                fishSpecies = fishCatch?.FishSpecies ?? "Fish",
                quantityKg = totalKg,
                bidPricePerKg = pricePerKg,
                totalAmount = o.TotalAmount > 0 ? o.TotalAmount : (pricePerKg * totalKg),
                status = o.Status,
                createdAt = o.CreatedAt,
                pickupLocation = fishCatch?.Location ?? "Harbor",
                photoUrl = fishCatch?.PhotoUrl,
                qualityGrade = fishCatch != null ? (fishCatch.QualityScore >= 85 ? "A" : fishCatch.QualityScore >= 70 ? "B" : "C") : "A",
                delivery = plan != null ? new
                {
                    planId = plan.PlanId,
                    vehicle = plan.VehicleCode,
                    driver = plan.DriverCode,
                    storage = plan.ColdStorageCode,
                    route = plan.SelectedRoute,
                    distanceKm = plan.DistanceKm,
                    estimatedMinutes = plan.EstimatedMinutes,
                    status = plan.Status,
                    pickupLocation = plan.PickupLocation,
                    deliveryLocation = plan.DeliveryLocation,
                    eta = plan.EstimatedETA,
                    pickupTime = plan.PickupTime,
                    reasoning = plan.AgentReasoning
                } : null
            };
        });

        return Ok(result);
    }

    [HttpPatch("{id}/accept")]
    [Authorize(Roles = "Fisherman,Admin,Buyer")]
    public async Task<IActionResult> AcceptBid(int id)
    {
        var bid = await _context.Bids.Include(b => b.Catch).FirstOrDefaultAsync(b => b.Id == id);
        if (bid == null) return NotFound("Bid not found");

        var userRole = User.FindFirst(ClaimTypes.Role)?.Value;
        var userIdStr = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var isDev = string.Equals(Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT"), "Development", StringComparison.OrdinalIgnoreCase);
        if (!isDev && userRole != "Admin" && userIdStr != null && bid.Catch != null && bid.Catch.FishermanId != int.Parse(userIdStr))
        {
            return Forbid();
        }

        if (bid.Catch != null && bid.Catch.Status == "Sold")
        {
            return BadRequest("This catch has already been sold.");
        }

        if (bid.Status == "Accepted")
        {
            return BadRequest("This bid has already been accepted.");
        }

        bid.Status = "Accepted";

        // Mark other bids for this catch as Rejected / Lost
        var otherBids = await _context.Bids
            .Where(b => b.CatchId == bid.CatchId && b.Id != id)
            .ToListAsync();
        foreach (var ob in otherBids)
        {
            ob.Status = "Lost";
        }

        // Create Order
        var total = bid.BidPricePerKg * (bid.Catch?.QuantityKg ?? 1);
        var order = new Order
        {
            BidId = bid.Id,
            TotalAmount = total,
            Status = "Created",
            CreatedAt = DateTime.UtcNow,
        };
        _context.Orders.Add(order);

        if (bid.Catch != null)
        {
            bid.Catch.Status = "Sold";
        }

        await _context.SaveChangesAsync();

        // Trigger Logistics Agent (via workflow record & internal HTTP)
        try
        {
            var workflow = await _context.AgentWorkflows.FirstOrDefaultAsync(w => w.CatchId == bid.CatchId);
            if (workflow != null)
            {
                workflow.CurrentAgent = "Logistics";
                workflow.LastUpdatedAt = DateTime.UtcNow;
                await _context.SaveChangesAsync();
            }

            var buyer = await _context.Users.FindAsync(bid.BuyerId);
            var buyerName = buyer?.FullName ?? "Valued Buyer";
            var deliveryLocation = "Colombo Central Fish Market";

            using var http = new System.Net.Http.HttpClient { Timeout = TimeSpan.FromSeconds(5) };
            await http.PostAsJsonAsync("http://localhost:8000/api/logistics/plan", new
            {
                workflow_id = workflow?.WorkflowId ?? $"WF-LOG-{bid.CatchId}",
                catch_id = bid.CatchId,
                order_id = order.Id,
                buyer_id = bid.BuyerId,
                buyer_name = buyerName,
                fish_species = bid.Catch?.FishSpecies ?? "Fish",
                quantity_kg = (double)(bid.Catch?.QuantityKg ?? 100),
                pickup_location = !string.IsNullOrEmpty(bid.Catch?.Location) ? bid.Catch.Location : "Negombo Pier",
                delivery_location = deliveryLocation,
            });
        }
        catch { /* logistics agent trigger non-blocking */ }

        return Ok(new
        {
            message = "Bid accepted successfully! Order created and Logistics Agent triggered.",
            orderId = order.Id,
            bidId = bid.Id,
            status = "Accepted",
            totalAmount = total,
        });
    }

    [HttpPatch("{id}/reject")]
    [Authorize(Roles = "Fisherman,Admin,Buyer")]
    public async Task<IActionResult> RejectBid(int id)
    {
        var bid = await _context.Bids.Include(b => b.Catch).FirstOrDefaultAsync(b => b.Id == id);
        if (bid == null) return NotFound("Bid not found");

        var userRole = User.FindFirst(ClaimTypes.Role)?.Value;
        var userIdStr = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var isDev = string.Equals(Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT"), "Development", StringComparison.OrdinalIgnoreCase);
        if (!isDev && userRole != "Admin" && userIdStr != null && bid.Catch != null && bid.Catch.FishermanId != int.Parse(userIdStr))
        {
            return Forbid();
        }

        if (bid.Status == "Accepted")
        {
            return BadRequest("Cannot reject an already accepted bid.");
        }

        bid.Status = "Rejected";
        await _context.SaveChangesAsync();

        return Ok(new { message = "Bid rejected.", bidId = id, status = "Rejected" });
    }
}
