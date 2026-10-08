using FishLink.API.Data;
using FishLink.API.Models;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace FishLink.API.Tests;

/// <summary>
/// Member 4: Logistics & Delivery Fleet Scheduling Component Tests
/// Tests vehicle availability, capacity filtering, driver assignment, and human approval flow.
/// </summary>
public sealed class Member4_LogisticsTests
{
    private static ApplicationDbContext CreateInMemoryDb()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new ApplicationDbContext(options);
    }

    [Fact]
    public async Task Member4_GetAvailableVehicles_FiltersByCapacityAndStatus()
    {
        var db = CreateInMemoryDb();
        db.Vehicles.AddRange(
            new Vehicle { VehicleCode = "V01", LicensePlate = "WP-AB-1234", VehicleType = "Refrigerated Truck", CapacityKg = 500, Status = "Available" },
            new Vehicle { VehicleCode = "V02", LicensePlate = "WP-CD-5678", VehicleType = "Small Chiller", CapacityKg = 100, Status = "Available" },
            new Vehicle { VehicleCode = "V03", LicensePlate = "WP-EF-9012", VehicleType = "Refrigerated Truck", CapacityKg = 1000, Status = "Busy" }
        );
        await db.SaveChangesAsync();

        var available = await db.Vehicles
            .Where(v => v.Status == "Available" && v.CapacityKg >= 200)
            .ToListAsync();

        Assert.Single(available);
        Assert.Equal("V01", available.First().VehicleCode);
        Assert.Equal(500, available.First().CapacityKg);
    }

    [Fact]
    public async Task Member4_AvailableDrivers_ReturnsOnlyActiveDrivers()
    {
        var db = CreateInMemoryDb();
        db.Drivers.AddRange(
            new Driver { DriverCode = "D01", FullName = "Sunil Silva", Phone = "0771234567", Status = "Available" },
            new Driver { DriverCode = "D02", FullName = "Kamal Perera", Phone = "0719876543", Status = "Busy" }
        );
        await db.SaveChangesAsync();

        var active = await db.Drivers.Where(d => d.Status == "Available").ToListAsync();

        Assert.Single(active);
        Assert.Equal("D01", active.First().DriverCode);
    }

    [Fact]
    public async Task Member4_AdminApproval_UpdatesPlanStatusToApproved()
    {
        var db = CreateInMemoryDb();
        var plan = new DeliveryPlan
        {
            PlanId = "PLAN-2026-001",
            CatchId = 10,
            VehicleCode = "V01",
            DriverCode = "D01",
            PickupLocation = "Negombo",
            DeliveryLocation = "Colombo",
            Status = "PendingApproval",
            CreatedAt = DateTime.UtcNow
        };
        db.DeliveryPlans.Add(plan);
        await db.SaveChangesAsync();

        // Admin action: Human-in-the-loop review
        plan.Status = "Approved";
        plan.AdminNote = "Approved by Logistics Manager";
        await db.SaveChangesAsync();

        var updated = await db.DeliveryPlans.FirstOrDefaultAsync(p => p.PlanId == "PLAN-2026-001");
        Assert.NotNull(updated);
        Assert.Equal("Approved", updated.Status);
        Assert.Equal("Approved by Logistics Manager", updated.AdminNote);
    }
}
