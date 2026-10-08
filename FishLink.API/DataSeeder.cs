using FishLink.API.Data;
using FishLink.API.Models;
using Microsoft.EntityFrameworkCore;

namespace FishLink.API;

/// <summary>
/// Seeds realistic buyer preferences and bid history for the 5 test buyers.
/// Run via: dotnet run --seed
/// </summary>
public static class DataSeeder
{
    public static async Task SeedAsync(ApplicationDbContext db)
    {
        Console.WriteLine("🌱 Starting seed...");

        // ── 0. Seed default demo users if missing ─────────────────────────────
        if (!await db.Users.AnyAsync())
        {
            Console.WriteLine("Creating default demo users...");
            var defaultPassword = BCrypt.Net.BCrypt.HashPassword("Password123!");
            var seedUsers = new List<User>
            {
                new() { FullName = "System Administrator", Email = "admin@fishlink.com", Role = "Admin", PasswordHash = defaultPassword },
                new() { FullName = "Sunil Perera", Email = "fisherman@fishlink.com", Role = "Fisherman", PasswordHash = defaultPassword },
                new() { FullName = "Kamal Silva", Email = "buyer@fishlink.com", Role = "Buyer", PasswordHash = defaultPassword },
                new() { FullName = "Nimal Fernando", Email = "buyer2@fishlink.com", Role = "Buyer", PasswordHash = defaultPassword },
                new() { FullName = "Kasun Logistics", Email = "logistics@fishlink.com", Role = "Logistics", PasswordHash = defaultPassword }
            };
            db.Users.AddRange(seedUsers);
            await db.SaveChangesAsync();
            Console.WriteLine("✅ Default demo users created (admin, fisherman, buyers, logistics). Password: Password123!");
        }

        // ── 1. Get buyer IDs ─────────────────────────────────────────────────
        var buyers = await db.Users
            .Where(u => u.Role == "Buyer")
            .OrderBy(u => u.Id)
            .ToListAsync();

        if (buyers.Count == 0)
        {
            Console.WriteLine("❌ No buyers found.");
            return;
        }

        Console.WriteLine($"Found {buyers.Count} buyers: {string.Join(", ", buyers.Select(b => b.FullName))}");

        // ── 2. Get or create some Published catches for bids ──────────────────
        var catches = await db.Catches
            .Where(c => c.Status == "Published" || c.Status == "Bidding" || c.Status == "Sold")
            .ToListAsync();

        // If not enough catches, create seed catches
        if (catches.Count < 4)
        {
            Console.WriteLine("Creating seed catches...");
            var fishermanId = (await db.Users.FirstOrDefaultAsync(u => u.Role == "Fisherman"))?.Id ?? 1;

            var seedCatches = new[]
            {
                new Catch { FishermanId=fishermanId, FishSpecies="Tuna (Yellowfin)", QuantityKg=150, AskingPricePerKg=2200, Location="Negombo Pier", Status="Sold",      QualityScore=88, CreatedAt=DateTime.UtcNow.AddDays(-25) },
                new Catch { FishermanId=fishermanId, FishSpecies="Tuna (Yellowfin)", QuantityKg=200, AskingPricePerKg=2350, Location="Negombo Harbor", Status="Sold",     QualityScore=92, CreatedAt=DateTime.UtcNow.AddDays(-18) },
                new Catch { FishermanId=fishermanId, FishSpecies="Skipjack",         QuantityKg=120, AskingPricePerKg=750,  Location="Negombo Pier", Status="Sold",       QualityScore=75, CreatedAt=DateTime.UtcNow.AddDays(-20) },
                new Catch { FishermanId=fishermanId, FishSpecies="Skipjack",         QuantityKg=80,  AskingPricePerKg=820,  Location="Colombo Harbor", Status="Sold",     QualityScore=70, CreatedAt=DateTime.UtcNow.AddDays(-12) },
                new Catch { FishermanId=fishermanId, FishSpecies="Trevally (Paraw)", QuantityKg=300, AskingPricePerKg=1100, Location="Negombo Pier", Status="Sold",       QualityScore=80, CreatedAt=DateTime.UtcNow.AddDays(-15) },
                new Catch { FishermanId=fishermanId, FishSpecies="Trevally (Paraw)", QuantityKg=180, AskingPricePerKg=1250, Location="Galle Harbor",  Status="Sold",      QualityScore=85, CreatedAt=DateTime.UtcNow.AddDays(-8)  },
                new Catch { FishermanId=fishermanId, FishSpecies="Mackerel",         QuantityKg=90,  AskingPricePerKg=580,  Location="Kandy Market",  Status="Sold",      QualityScore=65, CreatedAt=DateTime.UtcNow.AddDays(-22) },
                new Catch { FishermanId=fishermanId, FishSpecies="Mackerel",         QuantityKg=60,  AskingPricePerKg=650,  Location="Kandy Market",  Status="Sold",      QualityScore=72, CreatedAt=DateTime.UtcNow.AddDays(-10) },
                new Catch { FishermanId=fishermanId, FishSpecies="Tuna (Yellowfin)", QuantityKg=250, AskingPricePerKg=2100, Location="Colombo Harbor", Status="Published", QualityScore=90, CreatedAt=DateTime.UtcNow.AddDays(-2)  },
                new Catch { FishermanId=fishermanId, FishSpecies="Skipjack",         QuantityKg=100, AskingPricePerKg=800,  Location="Negombo Pier",   Status="Published", QualityScore=78, CreatedAt=DateTime.UtcNow.AddDays(-1)  },
                new Catch { FishermanId=fishermanId, FishSpecies="Trevally (Paraw)", QuantityKg=200, AskingPricePerKg=1150, Location="Negombo Pier",   Status="Published", QualityScore=82, CreatedAt=DateTime.UtcNow                },
                new Catch { FishermanId=fishermanId, FishSpecies="Mackerel",         QuantityKg=75,  AskingPricePerKg=600,  Location="Kandy Market",   Status="Published", QualityScore=68, CreatedAt=DateTime.UtcNow                },
            };

            db.Catches.AddRange(seedCatches);
            await db.SaveChangesAsync();
            catches = await db.Catches.ToListAsync();
            Console.WriteLine($"  ✅ Created {seedCatches.Length} seed catches");
        }

        // ── 3. Seed BuyerPreferences ──────────────────────────────────────────

        // Realistic preferences per buyer
        var getBuyerId = (int index) => buyers[Math.Min(index, buyers.Count - 1)].Id;
        var prefData = new[]
        {
            // Samantha — Colombo wholesale buyer, wants quality Tuna
            new { BuyerId=getBuyerId(0), Species="Tuna (Yellowfin)", MinQty=100m, MaxQty=300m, MaxPrice=2600m, City="Colombo",  Notes="Fresh only, quality A or above" },
            // Rohan — Negombo local market, Skipjack specialist
            new { BuyerId=getBuyerId(1), Species="Skipjack",         MinQty=50m,  MaxQty=200m, MaxPrice=900m,  City="Negombo", Notes="Regular weekly buyer" },
            // Nimal — Negombo restaurant supplier, multiple species
            new { BuyerId=getBuyerId(2), Species="Trevally (Paraw)", MinQty=100m, MaxQty=500m, MaxPrice=1400m, City="Negombo", Notes="Prefers Negombo pier catches" },
            // Priya — Colombo exporter, large quantities of Tuna
            new { BuyerId=getBuyerId(3), Species="Tuna (Yellowfin)", MinQty=200m, MaxQty=600m, MaxPrice=2800m, City="Colombo", Notes="Export grade only" },
            // Kasun — Kandy distributor, budget Mackerel buyer
            new { BuyerId=getBuyerId(4), Species="Mackerel",         MinQty=50m,  MaxQty=150m, MaxPrice=700m,  City="Kandy",  Notes="Local distribution" },
        };

        foreach (var p in prefData)
        {
            var existing = await db.BuyerPreferences.FirstOrDefaultAsync(x => x.BuyerId == p.BuyerId);
            if (existing == null)
            {
                db.BuyerPreferences.Add(new BuyerPreference
                {
                    BuyerId          = p.BuyerId,
                    PreferredSpecies = p.Species,
                    MinQuantityKg    = p.MinQty,
                    MaxQuantityKg    = p.MaxQty,
                    MaxPricePerKg    = p.MaxPrice,
                    PreferredCity    = p.City,
                    Notes            = p.Notes,
                    UpdatedAt        = DateTime.UtcNow,
                });
                Console.WriteLine($"  ✅ Preference saved for {buyers.First(b => b.Id == p.BuyerId).FullName}");
            }
            else
            {
                Console.WriteLine($"  ⏭ Preference already exists for {buyers.First(b => b.Id == p.BuyerId).FullName}");
            }
        }
        await db.SaveChangesAsync();

        // ── 4. Seed Bid History ───────────────────────────────────────────────

        var tunaCatches     = catches.Where(c => c.FishSpecies == "Tuna (Yellowfin)").ToList();
        var skipjackCatches = catches.Where(c => c.FishSpecies == "Skipjack").ToList();
        var trevallyCatches = catches.Where(c => c.FishSpecies == "Trevally (Paraw)").ToList();
        var mackerelCatches = catches.Where(c => c.FishSpecies == "Mackerel").ToList();

        var bidSeeds = new List<(int BuyerId, Catch Catch, decimal BidPrice, string Status, int DaysAgo)>();

        // Samantha — Tuna buyer, multiple bids
        if (tunaCatches.Count >= 2)
        {
            bidSeeds.Add((getBuyerId(0), tunaCatches[0], 2150m, "Accepted", 24));
            bidSeeds.Add((getBuyerId(0), tunaCatches[1], 2300m, "Accepted", 17));
            if (tunaCatches.Count >= 3)
                bidSeeds.Add((getBuyerId(0), tunaCatches[2], 2050m, "Pending", 1));
        }

        // Rohan — Skipjack buyer
        if (skipjackCatches.Count >= 1)
        {
            bidSeeds.Add((getBuyerId(1), skipjackCatches[0], 720m, "Accepted", 19));
            if (skipjackCatches.Count >= 2)
                bidSeeds.Add((getBuyerId(1), skipjackCatches[1], 800m, "Pending", 1));
        }

        // Nimal — Trevally buyer
        if (trevallyCatches.Count >= 2)
        {
            bidSeeds.Add((getBuyerId(2), trevallyCatches[0], 1080m, "Accepted", 14));
            bidSeeds.Add((getBuyerId(2), trevallyCatches[1], 1200m, "Pending", 1));
        }

        // Priya — Large Tuna bids
        if (tunaCatches.Count >= 2)
        {
            bidSeeds.Add((getBuyerId(3), tunaCatches[0], 2180m, "Accepted", 24));
            bidSeeds.Add((getBuyerId(3), tunaCatches[1], 2320m, "Accepted", 17));
        }

        // Kasun — Mackerel bids
        if (mackerelCatches.Count >= 2)
        {
            bidSeeds.Add((getBuyerId(4), mackerelCatches[0], 560m, "Accepted", 21));
            bidSeeds.Add((getBuyerId(4), mackerelCatches[1], 630m, "Pending",  1));
        }

        int bidsAdded = 0;
        foreach (var (buyerId, fishCatch, bidPrice, status, daysAgo) in bidSeeds)
        {
            bool exists = await db.Bids.AnyAsync(b => b.BuyerId == buyerId && b.CatchId == fishCatch.Id);
            if (!exists)
            {
                db.Bids.Add(new Bid
                {
                    BuyerId      = buyerId,
                    CatchId      = fishCatch.Id,
                    BidPricePerKg = bidPrice,
                    BidTime      = DateTime.UtcNow.AddDays(-daysAgo),
                    Status       = status,
                });
                bidsAdded++;
            }
        }
        await db.SaveChangesAsync();
        Console.WriteLine($"  ✅ Added {bidsAdded} bid history records");

        Console.WriteLine("\n✅ Seed complete!");
        Console.WriteLine("   Buyers now have realistic preferences + bid history.");
        Console.WriteLine("   Recommendation scores will now be meaningful.");
    }
}

public static class LogisticsSeeder
{
    public static async Task SeedAsync(ApplicationDbContext db)
    {
        Console.WriteLine("🚚 Seeding Logistics data...");

        // ── Vehicles ──────────────────────────────────────────────────────────
        if (!await db.Vehicles.AnyAsync())
        {
            db.Vehicles.AddRange(
                new Vehicle { VehicleCode="V01", DriverName="Sunil Perera",  CapacityKg=50,  Status="Available",    LicensePlate="WP-CAB-1234", CurrentLocation="Negombo" },
                new Vehicle { VehicleCode="V02", DriverName="Kamal Silva",   CapacityKg=150, Status="Available",    LicensePlate="WP-GAN-5678", CurrentLocation="Negombo" },
                new Vehicle { VehicleCode="V03", DriverName="Nimal Fernando", CapacityKg=300, Status="Maintenance", LicensePlate="WP-KAB-9012", CurrentLocation="Colombo" },
                new Vehicle { VehicleCode="V04", DriverName="Rohan Jayawardena", CapacityKg=200, Status="Available", LicensePlate="WP-NB-3456", CurrentLocation="Negombo" }
            );
            await db.SaveChangesAsync();
            Console.WriteLine("  ✅ Vehicles seeded (V01–V04)");
        }

        // ── Drivers ───────────────────────────────────────────────────────────
        if (!await db.Drivers.AnyAsync())
        {
            db.Drivers.AddRange(
                new Driver { DriverCode="D01", FullName="Sunil Perera",      Phone="+94771234567", Status="Available", AvailableFrom="06:00", AvailableTo="14:00", CurrentLocation="Negombo",  TotalDeliveries=42 },
                new Driver { DriverCode="D02", FullName="Kamal Silva",       Phone="+94779876543", Status="Busy",      AvailableFrom="08:00", AvailableTo="16:00", CurrentLocation="Colombo",  TotalDeliveries=78 },
                new Driver { DriverCode="D03", FullName="Nimal Fernando",    Phone="+94775555555", Status="Available", AvailableFrom="14:00", AvailableTo="22:00", CurrentLocation="Negombo",  TotalDeliveries=31 },
                new Driver { DriverCode="D04", FullName="Rohan Jayawardena", Phone="+94773333333", Status="Available", AvailableFrom="06:00", AvailableTo="18:00", CurrentLocation="Negombo",  TotalDeliveries=55 }
            );
            await db.SaveChangesAsync();
            Console.WriteLine("  ✅ Drivers seeded (D01–D04)");
        }

        // ── Cold Storage ──────────────────────────────────────────────────────
        if (!await db.ColdStorages.AnyAsync())
        {
            db.ColdStorages.AddRange(
                new ColdStorage { StorageCode="C01", Name="Negombo Cold Store A",   Location="Negombo",  TotalCapacityKg=500,  UsedCapacityKg=480, TemperatureCelsius=3,  Status="Available" },
                new ColdStorage { StorageCode="C02", Name="Negombo Cold Store B",   Location="Negombo",  TotalCapacityKg=1000, UsedCapacityKg=200, TemperatureCelsius=2,  Status="Available" },
                new ColdStorage { StorageCode="C03", Name="Colombo Fish Hub",       Location="Colombo",  TotalCapacityKg=2000, UsedCapacityKg=800, TemperatureCelsius=4,  Status="Available" },
                new ColdStorage { StorageCode="C04", Name="Gampaha Storage",        Location="Gampaha",  TotalCapacityKg=300,  UsedCapacityKg=300, TemperatureCelsius=3,  Status="Full" }
            );
            await db.SaveChangesAsync();
            Console.WriteLine("  ✅ Cold Storage seeded (C01–C04)");
        }

        // ── Delivery Plans ───────────────────────────────────────────────────
        if (!await db.DeliveryPlans.AnyAsync())
        {
            var firstCatch = await db.Catches.FirstOrDefaultAsync();
            var catchId1 = firstCatch?.Id ?? 1;
            var secondCatch = await db.Catches.Skip(1).FirstOrDefaultAsync();
            var catchId2 = secondCatch?.Id ?? 2;
            var thirdCatch = await db.Catches.Skip(2).FirstOrDefaultAsync();
            var catchId3 = thirdCatch?.Id ?? 3;

            db.DeliveryPlans.AddRange(
                new DeliveryPlan
                {
                    PlanId           = $"PLAN-{catchId1}-0901",
                    CatchId          = catchId1,
                    VehicleCode      = "V01",
                    DriverCode       = "D01",
                    ColdStorageCode  = "C01",
                    PickupLocation   = "Negombo Harbor",
                    DeliveryLocation = "Peliyagoda Central Market, Colombo",
                    SelectedRoute    = "Route A (Colombo-Katunayake Expressway)",
                    DistanceKm       = 38,
                    EstimatedMinutes = 55,
                    PickupTime       = DateTime.UtcNow.AddMinutes(30),
                    EstimatedETA     = DateTime.UtcNow.AddMinutes(85),
                    DeliveryDeadline = DateTime.UtcNow.AddHours(3),
                    Status           = "PendingApproval",
                    AgentReasoning   = "Optimal refrigerated vehicle V01 (50kg) assigned with Driver Sunil Perera. Expressway selected for sub-1 hour transit to prevent cold-chain degradation.",
                    WeatherNote      = "Clear skies in Negombo (31°C). Moderate traffic expected near Peliyagoda expressway exit.",
                    CreatedAt        = DateTime.UtcNow.AddMinutes(-45)
                },
                new DeliveryPlan
                {
                    PlanId           = $"PLAN-{catchId2}-0845",
                    CatchId          = catchId2,
                    VehicleCode      = "V02",
                    DriverCode       = "D04",
                    ColdStorageCode  = "C02",
                    PickupLocation   = "Negombo Pier",
                    DeliveryLocation = "Kandy Central Fish Market",
                    SelectedRoute    = "Route A (Colombo-Kandy Road A1)",
                    DistanceKm       = 121,
                    EstimatedMinutes = 160,
                    PickupTime       = DateTime.UtcNow.AddHours(-1),
                    EstimatedETA     = DateTime.UtcNow.AddHours(2),
                    DeliveryDeadline = DateTime.UtcNow.AddHours(4),
                    Status           = "Scheduled",
                    AgentReasoning   = "High capacity refrigerated truck V02 (150kg) assigned for upland transport. Maintained at constant 2°C.",
                    WeatherNote      = "Light showers forecast near Kadugannawa pass. 20-minute safety buffer integrated.",
                    CreatedAt        = DateTime.UtcNow.AddHours(-2)
                },
                new DeliveryPlan
                {
                    PlanId           = $"PLAN-{catchId3}-0710",
                    CatchId          = catchId3,
                    VehicleCode      = "V04",
                    DriverCode       = "D02",
                    ColdStorageCode  = "C03",
                    PickupLocation   = "Negombo Harbor",
                    DeliveryLocation = "Galle Fisheries Harbor",
                    SelectedRoute    = "Route A (Southern Expressway)",
                    DistanceKm       = 148,
                    EstimatedMinutes = 120,
                    PickupTime       = DateTime.UtcNow.AddHours(-6),
                    EstimatedETA     = DateTime.UtcNow.AddHours(-4),
                    DeliveryDeadline = DateTime.UtcNow.AddHours(-3),
                    Status           = "Delivered",
                    AgentReasoning   = "Express transport delivered successfully. Cold-chain compliance log: 3.2°C sustained throughout trip.",
                    WeatherNote      = "Good driving conditions. On-time delivery confirmed by recipient buyer.",
                    CreatedAt        = DateTime.UtcNow.AddHours(-7),
                    UpdatedAt        = DateTime.UtcNow.AddHours(-4)
                }
            );
            await db.SaveChangesAsync();
            Console.WriteLine("  ✅ DeliveryPlans seeded (3 sample plans)");
        }

        Console.WriteLine("✅ Logistics seed complete!");
    }
}
