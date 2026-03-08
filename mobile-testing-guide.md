# Quick Start - Mobile Testing Guide

## 🚀 How to Test Mobile Features

### Method 1: Browser Developer Tools (Easiest)

#### Chrome/Edge

1. Press `F12` to open DevTools
2. Click the **"Toggle device toolbar"** icon (or press `Ctrl+Shift+M`)
3. Select a mobile device from the dropdown (e.g., "iPhone 12 Pro")
4. Choose **Portrait** orientation
5. Reload the page

#### Firefox

1. Press `F12` to open DevTools
2. Click **"Responsive Design Mode"** icon (or press `Ctrl+Shift+M`)
3. Select a device or set custom dimensions
4. Choose Portrait orientation
5. Reload the page

### Method 2: Access from Your Phone

#### Option A: Local Network (Same WiFi)

1. On your computer, find your local IP address:

    ```powershell
    ipconfig
    ```

    Look for "IPv4 Address" (e.g., 192.168.1.100)

2. Start the server:

    ```powershell
    .\start.bat
    ```

3. On your phone's browser, go to:
    ```
    http://YOUR_IP_ADDRESS:5000
    ```
    (Replace YOUR_IP_ADDRESS with your actual IP)

#### Option B: Deploy to GitHub Pages or Vercel

- For testing on public URLs

---

## ✅ Features to Test

### 1. Hamburger Menu (☰)

- [ ] **Appears** in top-left corner on mobile screens
- [ ] **Opens sidebar** when tapped
- [ ] **Background darkens** (backdrop appears)
- [ ] **Sidebar slides in** from the left smoothly
- [ ] **Closes** when tapping backdrop
- [ ] **Closes** when selecting a chapter/section

### 2. Sidebar Behavior

- [ ] On desktop: Fixed on the left
- [ ] On tablet: Reduced width (260px)
- [ ] On mobile landscape: Overlay (280px)
- [ ] On mobile portrait: Full-width overlay
- [ ] Smooth slide animations
- [ ] Touch-friendly spacing

### 3. Content Layout

- [ ] Welcome screen centers properly
- [ ] Section header stacks on mobile
- [ ] Sentence cards are readable
- [ ] Buttons are large enough to tap
- [ ] Font sizes are appropriate

### 4. Detail Panel

- [ ] Opens as full-screen on mobile
- [ ] Slides in from right
- [ ] Close button is easy to reach
- [ ] Content is scrollable
- [ ] Vocabulary details display correctly

### 5. Touch Interactions

- [ ] All buttons respond to touch
- [ ] No need to hover for actions
- [ ] Scrolling is smooth
- [ ] No accidental double-taps
- [ ] Context menus work

### 6. Orientation Changes

- [ ] Portrait → Landscape transition works
- [ ] Landscape → Portrait transition works
- [ ] Layout adapts immediately
- [ ] No content overlap

---

## 📱 Recommended Test Devices

### Portrait Testing (Primary)

```
✓ iPhone SE (375x667) - Small phone
✓ iPhone 12 (390x844) - Standard phone
✓ iPhone 14 Pro Max (430x932) - Large phone
✓ Galaxy S21 (360x800) - Android standard
✓ Pixel 5 (393x851) - Android
```

### Landscape Testing

```
✓ Any of the above rotated 90°
```

### Tablet Testing

```
✓ iPad Mini (768x1024) - Small tablet
✓ iPad Air (820x1180) - Standard tablet
✓ iPad Pro (1024x1366) - Large tablet
```

---

## 🎯 Quick Test Scenarios

### Scenario 1: New User on Phone

1. Open app on phone (portrait mode)
2. See welcome screen with book list
3. Tap hamburger menu (☰)
4. Sidebar slides in
5. Tap backdrop to close
6. Create/open a book
7. Add a chapter using the menu
8. Add a sentence
9. Select text to add vocabulary
10. View vocab in detail panel (full-screen)

### Scenario 2: Reading Mode

1. Open existing book with content
2. Navigate through table of contents
3. Read sentences in portrait mode
4. Tap vocabulary words
5. View definitions in detail panel
6. Close panel and continue reading
7. Use filter to search sentences

### Scenario 3: Orientation Switch

1. Start in portrait mode
2. Open sidebar
3. Rotate to landscape
4. Verify layout adapts
5. Rotate back to portrait
6. Ensure nothing breaks

---

## 🐛 Common Issues & Solutions

### Issue: Hamburger menu not visible

**Solution**: Check screen width in DevTools, should be ≤768px

### Issue: Sidebar doesn't slide

**Solution**: Verify JavaScript console for errors, ensure scripts loaded

### Issue: Text too small

**Solution**: Use browser zoom (pinch gesture) or check viewport meta tag

### Issue: Buttons not responding

**Solution**: Ensure touch events are enabled, check z-index of elements

### Issue: Layout looks wrong

**Solution**: Hard refresh (Ctrl+Shift+R) to clear cache

---

## 📊 Browser DevTools Settings

### Chrome/Edge Mobile Emulation

```
1. Device: iPhone 12 Pro (or any)
2. Orientation: Portrait
3. Zoom: 100%
4. Touch: Enabled
5. Throttling: No throttling (for testing)
```

### Useful Console Commands

```javascript
// Check current window width
console.log(window.innerWidth);

// Check if mobile menu is visible
console.log(
    getComputedStyle(document.querySelector(".sidebar-toggle")).display,
);

// Force sidebar open (debugging)
document.querySelector(".sidebar").classList.add("mobile-open");
```

---

## ✨ Visual Checklist

When viewing on mobile, you should see:

**Top-Left Corner:**

```
┌─────────────────────┐
│ [☰] English Read... │  ← Hamburger menu button
│                     │
│   Content Here...   │
│                     │
└─────────────────────┘
```

**Sidebar Open:**

```
┌──────────┬──────────┐
│ Contents │[Backdrop]│  ← Dark overlay
│ • Chap 1 │          │
│ • Chap 2 │          │
│ • Chap 3 │          │
└──────────┴──────────┘
```

**Detail Panel:**

```
┌─────────────────────┐
│ ← Vocab Details   ✕ │  ← Full screen
│─────────────────────│
│ Word: example       │
│ Translation: ...    │
│ Definitions: ...    │
│                     │
└─────────────────────┘
```

---

## 🎉 Success Criteria

Your mobile implementation is working if:

- ✅ Hamburger menu appears on screens ≤768px
- ✅ Sidebar slides in/out smoothly
- ✅ All content is readable without horizontal scroll
- ✅ Buttons are easy to tap (no mis-clicks)
- ✅ Detail panel opens full-screen
- ✅ Orientation changes work smoothly
- ✅ No layout breaks or overlaps
- ✅ Scrolling is smooth and natural

---

## 📞 Need Help?

Check these files for reference:

- `mobile-guide.md` - Complete mobile user guide
- `mobile-update-summary.md` - Technical implementation details
- `styles.css` - Lines 979+ for responsive CSS
- `app.js` - Lines 1472+ for mobile menu logic

Happy testing! 📱✨
