# SVG Icon Guide for Feature Flags

## How to Store Icons in Supabase

The `icon_url` field in the `feature_flags` table supports multiple formats:

### 1. **Emoji Icons** (Simple & Quick)
Store single emoji characters:
```
😀 or 📂 or 🎯 or 📊
```

### 2. **SVG Markup** (Recommended for Custom Icons)
Store raw SVG code directly in the database. The app will automatically:
- Set fill and stroke to white for visibility
- Size it correctly (26px for Dashboard, 24px for FeaturesManager)

Example SVG:
```xml
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" stroke="currentColor" stroke-width="2"/>
</svg>
```

The app will automatically enhance it to:
```xml
<svg viewBox="0 0 24 24" width="26" height="26" fill="white" stroke="white" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" stroke="white" stroke-width="2"/>
</svg>
```

### 3. **Image URLs**
- HTTP/HTTPS URLs: `https://example.com/icon.png`
- Relative paths: `/icons/feature.png`
- Data URLs: `data:image/png;base64,...`

### 4. **No Icon**
Leave blank to fall back to route-based icon, or generic grid icon.

## Icon Rendering Priority

1. **Emoji** - If ≤4 chars and not URL
2. **SVG Markup** - If contains `<svg`
3. **Image URL** - If starts with http, /, or data:
4. **Route-based Icon** - If route exists in predefined map
5. **Fallback Grid** - Default generic icon

## Where Icons Display

- **Dashboard (Quick Actions)**: 26x26 pixels
- **FeaturesManager (Cards)**: 24x24 pixels
- **Color**: White (automatically applied)

## Tips for Better Icons

✅ Use simple, single-color SVGs
✅ Remove explicit fill/stroke attributes (app will add white)
✅ Use viewBox instead of fixed dimensions
✅ Keep SVG code compact (minimize whitespace)

❌ Don't use colored SVGs (will be overridden to white)
❌ Don't include CSS styles inside SVG
❌ Don't use external font files in SVG

## Database Query Example

```sql
UPDATE feature_flags 
SET icon_url = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9"/></svg>'
WHERE id = '...';
```

## HTML Entity Encoding

If storing in plain text, the app automatically decodes:
- `&lt;` → `<`
- `&gt;` → `>`
- `&quot;` → `"`
- `&#39;` → `'`
- `&amp;` → `&`
