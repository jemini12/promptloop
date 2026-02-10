# UI Controls Taxonomy

## Navigation vs Action

### Navigation (`LinkButton`)
Use `LinkButton` (wraps `next/link`) when the control navigates to a different URL:
- Landing page CTAs (Create Job, View Dashboard, Help)
- Dashboard actions (Create Job button, Edit/History links)
- Navbar links (Home, Dashboard, Help, Sign in/out)
- Back links

**Characteristics:**
- Has an `href` prop
- Supports right-click "Open in new tab"
- Browser shows link destination on hover
- Activates on Enter key
- Cannot be truly disabled (avoid "disabled links")

### Action (`Button`)
Use `Button` (renders `<button>`) when the control performs an action without navigating:
- Form submissions (Save Job, Delete Job)
- Imperative functions (Sign in with provider, Run preview)
- State mutations (Clear prompt, Use example)
- Toggle actions

**Characteristics:**
- Has an `onClick` handler
- Supports `disabled` state
- Can show loading state
- Activates on Space or Enter key
- No href attribute

## Ambiguous Cases

**Preview**: Action (unless there's a stable URL representing the preview output)
**Sign in providers**: Action (calls `signIn()` function, not a direct navigation)

## Implementation Notes

Both `Button` and `LinkButton` share the same styling system via variants:
- `variant`: "primary" | "secondary" | "ghost" | "danger"
- `size`: "sm" | "md" | "lg"

This ensures identical visual appearance for the same variant/size combination.
