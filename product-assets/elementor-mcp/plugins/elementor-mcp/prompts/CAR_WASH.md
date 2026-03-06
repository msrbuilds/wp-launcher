Create a sleek, high-energy landing page for "Chrome & Shine Auto Spa" — a premium car wash and auto detailing center.

## CRITICAL LAYOUT RULES
- For side-by-side columns, use a parent container with flex_direction=row. Children will auto-get content_width=full with equal percentage widths.
- NEVER set flex_wrap or _flex_size in any container settings — these are stripped automatically and cause layout issues.
- NEVER set _flex_size: 'grow' on any element.
- Top-level containers should use content_width=boxed (default).
- Do NOT manually set content_width or width on row children — the build-page tool calculates these automatically.

## DESIGN SYSTEM

### Color Palette
- Primary: #0D1B2A (deep midnight blue)
- Primary Light: #1B2D44 (dark steel)
- Accent: #00B4D8 (electric cyan/water blue)
- Accent Light: #90E0EF (light aqua)
- Chrome: #C0C0C0 (silver/chrome)
- Yellow: #FFD60A (bright yellow for highlights)
- Dark: #080F18 (near-black)
- Light Text: #FFFFFF
- Body Text: #8B95A2 (cool gray)
- Light BG: #F0F4F8 (cool light gray)
- Card BG: #FFFFFF
- Border: #1E3050

### Typography
- Headings: uppercase, weight 700-800 — bold, industrial, confident
- Section subtitles: uppercase, letter-spacing=4px, size=11px, color=#00B4D8
- Body text: size 16px, color=#8B95A2, line-height 1.8

## IMAGE SOURCING — DO THIS FIRST
1. "car wash water spray professional" — hero
2. "car detailing polishing close up" — services
3. "luxury car clean shiny showroom" — results
4. "car interior cleaning detail" — interior
5. "suv car wash foam soap" — wash packages
6. "car ceramic coating shine" — premium
7. "car wash team professional workers" — about
8. "sports car wet reflection" — CTA

## SVG ICONS
Bold, clean icons: Water droplet, Car/vehicle, Sparkle/shine, Shield, Spray bottle, Tire/wheel, Clock, Star, Wrench, Checkmark.

## PAGE STRUCTURE

### 1. HERO (2-column: text left, booking right)
- Background: sideloaded car wash spray image, background_size='cover'
- Overlay: background_overlay_color='#080F18', background_overlay_opacity={size:0.75,unit:'px'}
- Min-height: {size:680,unit:'px'}
- flex_direction=row
- Left child (align_items='flex-start', justify_content='center'):
  - "PREMIUM AUTO DETAILING" — color=#00B4D8, letter-spacing=4px, size=12px
  - "Your Car Deserves the Best" — color=#FFFFFF, size=48px, weight=800
  - "Professional hand wash, ceramic coatings, and full detailing. Walk-ins welcome or book online." — color=#8B95A2
  - "View Packages" + "Call: (555) 789-2345" buttons — cyan bg + chrome border
- Right child: Form — background_color='#FFFFFF', padding 30px, border_radius=8px
  - "Book Your Wash" heading (#0D1B2A)
  - Fields: Name, Phone, Email, Vehicle Type [Sedan, SUV/Truck, Sports Car, Van/Minivan, Motorcycle, Other], Service [Express Wash, Full Detail, Ceramic Coating, Interior Deep Clean], Preferred Date
  - "Book Appointment" button — #00B4D8 bg, #FFFFFF text

### 2. TRUST BAR (stats)
- Background: background_color='#0D1B2A'
- Padding: {top:'30',right:'0',bottom:'30',left:'0',unit:'px'}
- Row 4: "15,000+" / "Cars Washed Monthly" | "4.9★" / "Google Rating" | "100%" / "Hand Wash" | "Eco" / "Friendly Products" — #FFFFFF headings, #8B95A2 labels

### 3. SERVICES (4 cards)
- Background: background_color='#F0F4F8'
- "OUR SERVICES" subtitle + "What We Offer" heading
- Row 4 cards (background_color='#FFFFFF', padding 30px):
  - Exterior Hand Wash — "Premium hand wash with pH-balanced foam, wheel cleaning, and towel dry."
  - Full Detail — "Complete interior and exterior detail including clay bar, polish, and wax."
  - Ceramic Coating — "Long-lasting nano-ceramic protection for ultimate paint defense."
  - Interior Deep Clean — "Steam cleaning, leather conditioning, carpet extraction, odor removal."
- Each: icon, name (#0D1B2A), description (#8B95A2), "Learn More" link (#00B4D8)

### 4. WASH PACKAGES (3 tiers)
- Background: background_color='#FFFFFF'
- "PACKAGES" subtitle + "Choose Your Clean" heading
- Row 3 cards:
  - Express Wash ($25): Exterior hand wash, wheel clean, tire shine, windows, air freshener
  - Premium Detail ($89 — FEATURED): Full exterior wash, interior vacuum & wipe, dashboard treatment, tire dressing, scent treatment
  - Ultimate Spa ($179): Everything in Premium + clay bar, paint correction, ceramic spray sealant, leather conditioning, engine bay clean
- Featured: cyan border (#00B4D8), "MOST POPULAR" badge
- "Book Now" buttons — #00B4D8 bg

### 5. ABOUT (2-column: image left, text right)
- Background: background_color='#F0F4F8'
- Left: Team/facility image
- Right (align_items='flex-start'):
  - "ABOUT US" subtitle
  - "Where Clean Meets Craftsmanship" heading (#0D1B2A, weight=700)
  - Text about 10 years in business, trained technicians, eco-friendly products, state-of-the-art facility — color=#8B95A2
  - Points: "Fully Insured & Bonded" | "Eco-Friendly Products" | "Trained & Certified Staff" | "Satisfaction Guaranteed"

### 6. ADD-ON SERVICES (row of 3)
- Background: background_color='#0D1B2A'
- "ADD-ONS" subtitle (#00B4D8) + "Upgrade Your Experience" heading (#FFFFFF)
- Row 3 cards (background_color='#1B2D44', padding 25px, border_radius=6px):
  - Headlight Restoration ($45) — "Crystal-clear headlights for better visibility and appearance."
  - Paint Protection Film ($299+) — "Invisible shield against rock chips, scratches, and UV damage."
  - Odor Elimination ($35) — "Ozone treatment to completely neutralize stubborn odors."
- Each: icon, name (#FFFFFF), price (#00B4D8), description (#8B95A2)

### 7. TESTIMONIALS (3 cards)
- Background: background_color='#FFFFFF'
- "REVIEWS" subtitle + "What Our Customers Say" heading
- Row 3: stars (#FFD60A), quote (italic, #8B95A2), name + vehicle (#0D1B2A)
  - "My Tesla has never looked this good. The ceramic coating is absolutely worth it." — Mark R., Tesla Model 3
  - "I've tried every car wash in town. Chrome & Shine is hands down the best." — Sarah K., BMW X5
  - "The interior deep clean saved my seats after a road trip with two kids and a dog!" — James T., Honda Odyssey

### 8. MEMBERSHIP / SUBSCRIPTION
- Background: background_color='#00B4D8'
- "UNLIMITED WASH CLUB" heading (#FFFFFF, weight=800)
- "Wash your car as often as you want. Plans starting at $39/month." — color=#E0F7FA
- "Join the Club" button — #FFFFFF bg, #00B4D8 text, border_radius=4px

### 9. CTA (full-screen photo)
- Background: sideloaded sports car wet image, background_size='cover'
- Overlay: background_overlay_color='#080F18', background_overlay_opacity={size:0.6,unit:'px'}
- "Drive Away Spotless" heading (#FFFFFF, weight=700, size=46px)
- "Book online or just drive in — no appointment needed for express washes." — color=#90E0EF
- "Book Now" button — #00B4D8 bg, #FFFFFF text

### 10. LOCATION & HOURS (2-column)
- Background: background_color='#F0F4F8'
- Left: "FIND US" subtitle, address, phone, hours (Mon-Sat 7AM-7PM, Sun 8AM-5PM), "Open 7 Days a Week" emphasis
- Right: Google Maps embed or map placeholder image

### 11. FOOTER
- Background: background_color='#080F18'
- 4 columns — color=#5A6577/#FFFFFF
  - Chrome & Shine Auto Spa | Services (Wash, Detail, Ceramic, Interior) | Quick Links | Contact
- Social: Instagram, Facebook, TikTok
- Copyright — color=#3A4555

## CUSTOM CSS

### Page-Level (add-custom-css, no element_id):
```css
html { scroll-behavior: smooth; }
.elementor-button { transition: all 0.3s ease !important; text-transform: uppercase !important; letter-spacing: 1.5px !important; }
.elementor-button:hover { transform: translateY(-3px); box-shadow: 0 10px 30px rgba(0, 180, 216, 0.3); }
.elementor-image img { transition: transform 0.6s ease, filter 0.4s ease; }
.elementor-image:hover img { transform: scale(1.04); }
.elementor-field-group input:focus, .elementor-field-group select:focus, .elementor-field-group textarea:focus { border-color: #00B4D8 !important; box-shadow: 0 0 0 3px rgba(0, 180, 216, 0.15) !important; }
::selection { background: #00B4D8; color: #FFFFFF; }
```

### Element-Level — Service Cards (add-custom-css with element_id):
```css
selector { transition: transform 0.4s ease, box-shadow 0.4s ease; }
selector:hover { transform: translateY(-8px); box-shadow: 0 20px 50px rgba(0, 180, 216, 0.1); }
```

### Element-Level — Featured Package (add-custom-css with element_id):
```css
selector { border: 2px solid #00B4D8; position: relative; }
selector::before { content: 'MOST POPULAR'; position: absolute; top: -1px; left: 50%; transform: translateX(-50%); background: #00B4D8; color: #FFFFFF; font-size: 10px; font-weight: 700; letter-spacing: 2px; padding: 5px 15px; }
```

### Element-Level — Booking Form Container (add-custom-css with element_id):
```css
selector { box-shadow: 0 25px 60px rgba(0, 0, 0, 0.4); backdrop-filter: blur(5px); }
```

### Element-Level — Add-On Cards (add-custom-css with element_id):
```css
selector { transition: transform 0.3s ease, border-color 0.3s ease; border: 1px solid #1E3050; }
selector:hover { transform: translateY(-6px); border-color: #00B4D8; box-shadow: 0 15px 40px rgba(0, 180, 216, 0.12); }
```

### Element-Level — Membership Section (add-custom-css with element_id):
```css
selector { background: linear-gradient(135deg, #00B4D8 0%, #0077B6 100%) !important; }
```

## CUSTOM JAVASCRIPT (add-custom-js, wrap_dom_ready=true):
```javascript
// Scroll-triggered fade-in
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.style.opacity = '1'; entry.target.style.transform = 'translateY(0)'; observer.unobserve(entry.target); }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });
document.querySelectorAll('.elementor-heading-title, .elementor-image, .elementor-widget-text-editor, .elementor-icon-box-wrapper').forEach(el => {
  el.style.opacity = '0'; el.style.transform = 'translateY(30px)'; el.style.transition = 'opacity 0.7s ease, transform 0.7s ease'; observer.observe(el);
});

// Counter animation for trust bar
const cObs = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const el = entry.target; const text = el.textContent.trim(); const match = text.match(/(\d[\d,]*)/);
      if (match) {
        const target = parseInt(match[1].replace(/,/g, '')); const suffix = text.substring(text.indexOf(match[1]) + match[1].length); const prefix = text.substring(0, text.indexOf(match[1]));
        let c = 0; const dur = 1500; const start = performance.now();
        function step(now) { const p = Math.min((now - start) / dur, 1); const e = 1 - Math.pow(1 - p, 3); c = Math.round(target * e); el.textContent = prefix + c.toLocaleString() + suffix; if (p < 1) requestAnimationFrame(step); }
        requestAnimationFrame(step);
      } cObs.unobserve(el);
    }
  });
}, { threshold: 0.5 });
document.querySelectorAll('.elementor-heading-title').forEach(el => { if (/[\d$]/.test(el.textContent.trim().charAt(0))) cObs.observe(el); });

// Water shimmer effect on hero
const hero = document.querySelector('.elementor-element[data-element_type="container"]');
if (hero) {
  const shimmer = document.createElement('div');
  shimmer.style.cssText = 'position:absolute;top:0;left:-100%;width:50%;height:100%;background:linear-gradient(90deg,transparent,rgba(0,180,216,0.03),transparent);animation:waterShimmer 4s ease-in-out infinite;pointer-events:none;z-index:1;';
  const style = document.createElement('style');
  style.textContent = '@keyframes waterShimmer{0%{left:-50%}100%{left:150%}}';
  document.head.appendChild(style);
  hero.style.position = 'relative'; hero.style.overflow = 'hidden';
  hero.appendChild(shimmer);
}
```

## SITE-WIDE CODE SNIPPET (add-code-snippet, optional):
```html
<!-- Google Analytics / Tag Manager placeholder -->
<script>
  // Replace with actual GA4 tracking code
  console.log('Chrome & Shine Auto Spa — Analytics Ready');
</script>
```
- location: head, priority: 5

## EXECUTION ORDER
1. Search & sideload images → 2. Upload SVG icons → 3. Build page → 4. Page-level CSS → 5. Element-level CSS (service cards, featured package, booking form, add-ons, membership) → 6. Custom JS → 7. Site-wide snippet (optional)

## FINAL CHECKLIST
- background_background + background_color on every colored container — All text colors explicit — NO flex_wrap or _flex_size — Dark industrial theme with cyan water accents — Wash packages with clear pricing tiers — Booking form with vehicle type and service selection — Membership/subscription section — Add-on services — Water shimmer hero animation — Counter animations on trust bar — Publish as draft
