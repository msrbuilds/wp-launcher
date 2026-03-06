Create a chic, modern landing page for "Velvet & Co." — an upscale hair salon and styling studio.

## CRITICAL LAYOUT RULES
- For side-by-side columns, use a parent container with flex_direction=row. Children will auto-get content_width=full with equal percentage widths.
- NEVER set flex_wrap or _flex_size in any container settings — these are stripped automatically and cause layout issues.
- NEVER set _flex_size: 'grow' on any element.
- Top-level containers should use content_width=boxed (default).
- Do NOT manually set content_width or width on row children — the build-page tool calculates these automatically.

## DESIGN SYSTEM

### Color Palette
- Primary: #2D2D2D (soft black)
- Accent: #D4A373 (warm bronze/caramel)
- Accent Light: #EADBC8 (champagne blush)
- Pink: #E8B4B8 (dusty rose)
- Dark: #1A1A1A (deep black)
- Light Text: #FFFFFF
- Body Text: #6B6B6B (warm gray)
- Light BG: #FAF7F4 (warm cream)
- Card BG: #FFFFFF
- Border: #E8E0D8

### Typography
- Headings: weight 400-600 (elegant, not heavy), title case
- Section subtitles: uppercase, letter-spacing=4px, size=11px, color=#D4A373
- Body text: size 16px, color=#6B6B6B, line-height 1.8

## IMAGE SOURCING — DO THIS FIRST
1. "luxury hair salon interior modern" — hero background
2. "hair stylist cutting professional" — services
3. "hair coloring highlights professional" — services
4. "beautiful hairstyle woman salon" — results
5. "hair salon wash station luxury" — experience
6. "hair products professional display" — retail
7. "hair salon team portrait" — team
8. "bridal hairstyle updo elegant" — services

## SVG ICONS
Elegant, thin-line icons: Scissors, Hair dryer, Comb, Mirror, Sparkle, Calendar, Clock, Crown, Heart, Star.

## PAGE STRUCTURE

### 1. HERO SECTION (2-column: text left, booking on right)
- Background: sideloaded salon interior, background_size='cover'
- Overlay: background_overlay_color='#1A1A1A', background_overlay_opacity={size:0.6,unit:'px'}
- Min-height: {size:650,unit:'px'}
- Row:
  - Left: "WELCOME TO VELVET & CO." label (#D4A373), "Where Beauty Meets Artistry" heading (#FFFFFF, 50px, weight=400), subtext (#EADBC8), "Book Appointment" + "Our Services" buttons
  - Right: Booking card — white bg, "Book Your Visit" heading, form (Name, Phone, Service select [Cut & Style, Color, Highlights, Balayage, Keratin Treatment, Bridal, Blowout], Preferred Date, "Book Now" button — #D4A373 bg)

### 2. SERVICES (6 cards in 3x2)
- Background: background_color='#FAF7F4'
- "OUR SERVICES" subtitle + "Crafted for You" heading
- 6 cards: icon, service name, description, starting price (#D4A373)
  - Cut & Style (from $65) | Color & Highlights (from $120) | Balayage & Ombré (from $180) | Keratin Treatment (from $250) | Bridal & Special Occasion (from $150) | Blowout & Styling (from $45)

### 3. ABOUT (2-column: image left, text right)
- Background: background_color='#FFFFFF'
- Left: Image, Right: "ABOUT US" subtitle, "Passion for Perfect Hair" heading, story, stats: "12+" years | "25K+" clients | "8" expert stylists

### 4. TEAM (4 stylist cards)
- Background: background_color='#FAF7F4'
- Row 4: image, name (#2D2D2D), specialty (#D4A373), "Book with [Name]" link
  - "Mia Chen — Color Specialist" | "James Hart — Creative Director" | "Sofia Reyes — Bridal Expert" | "Aisha Patel — Texture & Curls"

### 5. GALLERY (3x2 image grid)
- Background: background_color='#FFFFFF'
- "PORTFOLIO" subtitle + "Our Latest Work" heading
- 6 images in 2 rows of 3

### 6. PRODUCTS SECTION
- Background: background_color='#2D2D2D'
- "RETAIL" subtitle (#D4A373) + "Shop Our Favorites" heading (#FFFFFF)
- Row 3 product cards: product image, name, price, "Shop" link — dark card bg

### 7. TESTIMONIALS (3 cards)
- Background: background_color='#FAF7F4'
- Stars (#D4A373), quote, name

### 8. CTA
- Background: background_color='#D4A373'
- "Your Best Hair Day Awaits" heading (#FFFFFF), "Book Your Transformation" button (#2D2D2D bg)

### 9. FOOTER
- Background: background_color='#1A1A1A'
- 4 columns: Brand | Services | Info | Contact — color=#8B8B8B/#FFFFFF
- Copyright

## CUSTOM CSS

### Page-Level:
```css
html { scroll-behavior: smooth; }
.elementor-button { transition: all 0.4s ease !important; letter-spacing: 1.5px !important; }
.elementor-button:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(212, 163, 115, 0.25); }
.elementor-image img { transition: transform 0.6s ease; }
.elementor-image:hover img { transform: scale(1.04); }
.elementor-field-group input:focus, .elementor-field-group select:focus { border-color: #D4A373 !important; box-shadow: 0 0 0 3px rgba(212, 163, 115, 0.15) !important; }
::selection { background: #D4A373; color: #FFFFFF; }
```

### Element-Level — Service Cards:
```css
selector { transition: transform 0.4s ease, box-shadow 0.4s ease; }
selector:hover { transform: translateY(-8px); box-shadow: 0 20px 50px rgba(0,0,0,0.08); }
```

### Element-Level — Gallery Images:
```css
selector { overflow: hidden; }
selector img { transition: transform 0.6s ease; }
selector:hover img { transform: scale(1.08); }
```

### Element-Level — Booking Form:
```css
selector { box-shadow: 0 25px 60px rgba(0,0,0,0.25); }
```

## CUSTOM JAVASCRIPT (add-custom-js, wrap_dom_ready=true):
```javascript
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.style.opacity = '1'; entry.target.style.transform = 'translateY(0)'; observer.unobserve(entry.target); }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
document.querySelectorAll('.elementor-heading-title, .elementor-image, .elementor-icon-box-wrapper, .elementor-widget-text-editor').forEach(el => {
  el.style.opacity = '0'; el.style.transform = 'translateY(25px)'; el.style.transition = 'opacity 0.7s ease, transform 0.7s ease'; observer.observe(el);
});
```

## EXECUTION ORDER
1. Search & sideload images → 2. Upload SVG icons → 3. Build page → 4. Page-level CSS → 5. Element-level CSS → 6. Custom JS

## FINAL CHECKLIST
- background_background + background_color on every colored container — All text colors explicit — NO flex_wrap or _flex_size — Chic/salon aesthetic: bronze accents, warm creams, elegant typography — Service cards with pricing — Booking form in hero — Publish as draft
