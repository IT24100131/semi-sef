using FishLink.API.DTOs;
using FishLink.API.Models;

namespace FishLink.API.Services;

/// <summary>
/// Business logic for fish catch listings.
/// Controllers delegate all domain operations here.
/// </summary>
public interface ICatchService
{
    // Queries
    Task<PagedResult<Catch>> GetCatchesAsync(CatchQueryParams query);
    Task<Catch?>             GetByIdAsync(int id);
    Task<IEnumerable<object>> GetMarketStatsAsync();
    Task<object?>            GetSellerHistoryAsync(int fishermanId);

    // Commands
    Task<Catch>  CreateAsync(CatchRequest request, int fishermanId);
    Task<bool>   UpdateAsync(int id, CatchRequest request, int fishermanId, bool isAdmin = false);
    Task<bool>   PublishAsync(int id, int fishermanId, bool isAdmin = false);
    Task<bool>   CancelAsync(int id, int fishermanId, bool isAdmin = false);
    Task<bool>   DeleteAsync(int id, int fishermanId, bool isAdmin = false);
    Task<bool>   ReceiveValidationResultAsync(ValidationResultRequest result);
    Task<bool>   AdminApproveAsync(int id);
    Task<bool>   AdminRejectAsync(int id);
    Task<IEnumerable<Catch>> GetFlaggedAsync();
}

/// <summary>
/// Query parameters for catch listing — search, filter, sort, paginate.
/// </summary>
public class CatchQueryParams
{
    // Pagination
    public int Page     { get; set; } = 1;
    public int PageSize { get; set; } = 10;

    // Search
    public string? Search    { get; set; }   // searches fishSpecies + location

    // Filters
    public string? Species   { get; set; }
    public string? Status    { get; set; }
    public string? FraudRisk { get; set; }
    public decimal? MinPrice { get; set; }
    public decimal? MaxPrice { get; set; }
    public decimal? MinQty   { get; set; }
    public decimal? MaxQty   { get; set; }

    // Sort
    public string SortBy    { get; set; } = "createdAt";  // createdAt | price | quantity | species
    public string SortOrder { get; set; } = "desc";       // asc | desc
}

/// <summary>Generic paged result wrapper.</summary>
public class PagedResult<T>
{
    public IEnumerable<T> Items      { get; set; } = Enumerable.Empty<T>();
    public int            TotalCount { get; set; }
    public int            Page       { get; set; }
    public int            PageSize   { get; set; }
    public int            TotalPages => (int)Math.Ceiling((double)TotalCount / PageSize);
    public bool           HasNext    => Page < TotalPages;
    public bool           HasPrev    => Page > 1;
}
