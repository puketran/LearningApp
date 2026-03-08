# Mobile User Guide

This application is now fully optimized for mobile devices with portrait orientation support.

## Mobile Features

### 📱 Responsive Design

- **Portrait Mode**: Fully optimized for portrait orientation on phones and tablets
- **Landscape Mode**: Adapted layouts for landscape viewing
- **Touch-Friendly**: All buttons and interactive elements are sized for easy touch interaction
- **Smooth Scrolling**: Native smooth scrolling on all mobile devices

### 🎯 Mobile Navigation

#### Hamburger Menu (☰)

- **Location**: Top-left corner of the screen
- **Function**: Opens/closes the table of contents sidebar
- **Usage**:
    - Tap to open the sidebar menu
    - Tap the dark backdrop or select an item to close it
    - The sidebar slides in from the left

#### Sidebar Behavior

- On mobile devices, the sidebar becomes a slide-out overlay
- Takes full width on phones in portrait mode
- Automatically closes when you select a chapter/section
- Backdrop prevents accidental clicks on main content

### 📖 Reading Experience

#### Sentence Cards

- Optimized font sizes for comfortable reading on small screens
- Touch-friendly spacing between cards
- Action buttons always visible (no hover required)
- Swipe-friendly scrolling

#### Detail Panel

- Opens as a full-screen overlay on mobile
- Smooth slide-in animation from the right
- Easy-to-reach close button at the top
- Optimized content layout for narrow screens

### 🎨 Screen Size Optimizations

#### Very Small Screens (< 360px)

- Ultra-compact layout
- Minimum font size of 13px
- Reduced padding and spacing
- Optimized button sizes

#### Small Phones (360px - 480px)

- Font size: 14px
- Full-width sidebar when open
- Compact header and navigation
- Touch-friendly tap targets (44px minimum)

#### Large Phones & Small Tablets (480px - 768px)

- Font size: 15px
- 280px sidebar width
- Enhanced spacing
- Improved readability

#### Tablets (768px - 1024px)

- Desktop-like experience
- 260px sidebar
- 360px detail panel
- Balanced layout

### 💡 Mobile Tips

#### Portrait Mode Best Practices

1. **Navigation**: Use the hamburger menu to access chapters
2. **Reading**: Scroll through sentences vertically
3. **Vocabulary**: Tap highlighted words to view details
4. **Editing**: Forms and inputs are optimized for mobile keyboards

#### Landscape Mode Tips

1. More horizontal space for content
2. Sidebar and panels may appear simultaneously
3. Better for viewing longer sentences
4. Optimized header heights for more content space

### 🔧 Touch Gestures

- **Tap**: Select items, open menus, trigger actions
- **Scroll**: Navigate through content (sentences, vocab lists)
- **Long Press**: Context menus (where applicable)
- **Swipe Down**: Pull-to-refresh (browser native)

### 📐 Breakpoints

The app automatically adapts at these screen widths:

| Screen Width   | Device Type          | Layout Changes                            |
| -------------- | -------------------- | ----------------------------------------- |
| > 1024px       | Desktop/Large Tablet | Full 3-column layout                      |
| 768px - 1024px | Tablet               | Reduced sidebar, responsive detail panel  |
| 480px - 768px  | Large Phone          | Overlay sidebar, full-screen detail panel |
| 360px - 480px  | Phone                | Full-width sidebar, compact UI            |
| < 360px        | Small Phone          | Ultra-compact, minimum sizes              |

### 🎯 Orientation Support

#### Portrait Orientation

- **Primary Mode**: Optimized for vertical scrolling
- **Sidebar**: Slides in from left, full width on phones
- **Detail Panel**: Full-screen overlay
- **Content**: Stacked vertically for easy reading

#### Landscape Orientation (< 600px height)

- Reduced header sizes
- Compact icons and padding
- More content visible
- Optimized vocab list height

### ⚙️ Browser Compatibility

**Best Experience:**

- Safari on iOS 12+
- Chrome on Android 8+
- Modern mobile browsers (Firefox, Edge)

**Features:**

- Touch-optimized scrolling
- Smooth animations
- Hardware acceleration
- Proper zoom controls

### 🚀 Performance

**Mobile Optimizations:**

- CSS transitions use GPU acceleration
- Smooth 60fps animations
- Efficient touch event handling
- No unnecessary re-renders
- Optimized for battery life

### 📱 Installation

**Add to Home Screen (iOS):**

1. Open in Safari
2. Tap the Share button
3. Select "Add to Home Screen"
4. App will open in standalone mode

**Add to Home Screen (Android):**

1. Open in Chrome
2. Tap the menu (⋮)
3. Select "Add to Home Screen"
4. App will launch like a native app

### 🎨 Theme

- **Theme Color**: Indigo (#6366f1)
- **Status Bar**: Adapts to device theme
- **Dark Mode**: Respects system preferences (future enhancement)

### 🐛 Troubleshooting

**Sidebar won't open:**

- Ensure JavaScript is enabled
- Try refreshing the page
- Check browser console for errors

**Layout looks broken:**

- Clear browser cache
- Update to latest browser version
- Check internet connection for external fonts

**Touch not working:**

- Ensure touch events are enabled
- Try in a different browser
- Check if zoom is locked

**Text too small:**

- Use browser zoom (pinch-to-zoom)
- Check device's text size settings
- Consider accessibility options

### 📊 Recommended Settings

**For Best Mobile Experience:**

- Enable JavaScript
- Allow local storage
- Use portrait mode for reading
- Ensure good network connection for AI features
- Keep browser updated

## Development Notes

### Mobile-Specific CSS

- Uses `@media` queries for responsive breakpoints
- Touch-friendly minimum sizes (44x44px tap targets)
- Smooth transitions with `ease` timing
- Hardware-accelerated transforms

### JavaScript Enhancements

- Mobile menu toggle handlers
- Automatic sidebar closing on navigation
- Window resize listeners
- Touch event optimizations

### Accessibility

- ARIA labels on mobile controls
- Keyboard navigation support
- Screen reader friendly
- High contrast ratios
- Proper focus management
