using System.Security.Claims;
using FishLink.API.Controllers;
using FishLink.API.DTOs;
using FishLink.API.Models;
using FishLink.API.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace FishLink.API.Tests;

public sealed class CatchesControllerTests
{
    [Fact]
    public async Task GetCatch_returns_not_found_when_service_returns_null()
    {
        var service = new StubCatchService { Result = null };
        var controller = new CatchesController(service);
        var response = await controller.GetCatch(99);
        Assert.IsType<NotFoundObjectResult>(response);
    }

    [Fact]
    public async Task CreateCatch_returns_created_location_for_authenticated_fisherman()
    {
        var service = new StubCatchService { Created = new Catch { Id = 42, FishSpecies = "Tuna" } };
        var controller = new CatchesController(service)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(
                        [new Claim(ClaimTypes.NameIdentifier, "7")], "test"))
                }
            }
        };

        var response = await controller.CreateCatch(new CatchRequest { FishSpecies = "Tuna" });
        var created = Assert.IsType<CreatedAtActionResult>(response);
        Assert.Equal(42, ((Catch)created.Value!).Id);
        Assert.Equal(7, service.LastFishermanId);
    }

    private sealed class StubCatchService : ICatchService
    {
        public Catch? Result { get; set; }
        public Catch Created { get; set; } = new();
        public int LastFishermanId { get; private set; }
        public Task<Catch?> GetByIdAsync(int id) => Task.FromResult(Result);
        public Task<Catch> CreateAsync(CatchRequest request, int fishermanId) { LastFishermanId = fishermanId; return Task.FromResult(Created); }
        public Task<PagedResult<Catch>> GetCatchesAsync(CatchQueryParams q) => throw new NotImplementedException();
        public Task<IEnumerable<object>> GetMarketStatsAsync() => throw new NotImplementedException();
        public Task<object?> GetSellerHistoryAsync(int id) => throw new NotImplementedException();
        public Task<bool> UpdateAsync(int id, CatchRequest r, int f, bool isAdmin = false) => throw new NotImplementedException();
        public Task<bool> PublishAsync(int id, int f, bool isAdmin = false) => throw new NotImplementedException();
        public Task<bool> CancelAsync(int id, int f, bool isAdmin = false) => throw new NotImplementedException();
        public Task<bool> DeleteAsync(int id, int f, bool isAdmin = false) => throw new NotImplementedException();
        public Task<bool> ReceiveValidationResultAsync(ValidationResultRequest r) => throw new NotImplementedException();
        public Task<bool> AdminApproveAsync(int id) => throw new NotImplementedException();
        public Task<bool> AdminRejectAsync(int id) => throw new NotImplementedException();
        public Task<IEnumerable<Catch>> GetFlaggedAsync() => throw new NotImplementedException();
    }
}
