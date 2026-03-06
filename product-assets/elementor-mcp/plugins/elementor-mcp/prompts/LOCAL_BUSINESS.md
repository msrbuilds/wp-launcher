Create a professional landing page for "FlowFix Plumbing" — a local plumbing service business.

## CRITICAL LAYOUT RULES
- For side-by-side columns, use a parent container with flex_direction=row. Children will auto-get content_width=full with equal percentage widths.
- NEVER set flex_wrap or _flex_size in any container settings — these are stripped automatically and cause layout issues.
- NEVER set _flex_size: 'grow' on any element.
- Top-level containers should use content_width=boxed (default).
- Do NOT manually set content_width or width on row children — the build-page tool calculates these automatically.

## DESIGN SYSTEM (use consistently across ALL sections)

### Color Palette
- Primary: #1B4D7A (deep navy blue)
- Primary Dark: #0F2E4A (darker navy for hover/accents)
- Accent: #F59E0B (warm amber/gold)
- Accent Dark: #D97706 (darker amber for hover)
- Dark: #111827 (near-black for text)
- Light Text: #FFFFFF
- Body Text: #4B5563 (gray-600)
- Light BG: #F3F4F6 (gray-100)
- Card BG: #FFFFFF
- Footer BG: #0F172A (slate-900)

### Typography
- Headings: uppercase, bold (700-800 weight)
- Section subtitles: uppercase, letter-spacing, smaller size, color=accent
- Body text: size 16-17px, color=#4B5563, line-height 1.7

### Background Colors on Containers
- Set background_background='classic' AND background_color='#hex' — both are required
- For overlays: background_overlay_background='classic', background_overlay_color='#hex', background_overlay_opacity={size:0.75,unit:'px'}

## IMAGE SOURCING — DO THIS FIRST
Before building the page, use the search-images and sideload-image tools to download these images into the Media Library:
1. "plumber working pipes professional" — for hero background
2. "plumbing repair service professional" — for about section
3. "modern bathroom renovation luxury" — for gallery
4. "kitchen sink plumbing installation" — for gallery
5. "water heater installation professional" — for gallery
6. "pipe wrench plumbing tools closeup" — for gallery
7. "commercial plumbing industrial" — for gallery
8. "drain cleaning service professional" — for gallery

Use the actual sideloaded image IDs and URLs in the page structure. Do NOT use placeholder URLs.

## SVG ICONS — USE THESE INSTEAD OF ELEMENTOR LIBRARY
Use the upload-svg-icon tool or inline SVG in HTML widgets for icons. Do NOT use Elementor's default icon library (fa-solid, eicon, etc.). Design simple, clean SVG icons or use common SVG icon paths for:
- Wrench/tool icon (services)
- Water drop icon (hero/brand)
- Shield/checkmark icon (trust/guarantee)
- Clock icon (24/7 availability)
- Phone icon (contact)
- Map pin icon (location)
- Star icon (reviews)
- Dollar/price icon (pricing)

## PAGE STRUCTURE

### 1. HERO SECTION (2-column: text left, booking form right)
Full-width container with:
- Background: use the sideloaded plumber hero image (background_background='classic', background_image={url:'...', id:XX}, background_size='cover', background_position='center center')
- Dark overlay: background_overlay_background='classic', background_overlay_color='#0F172A', background_overlay_opacity={size:0.75,unit:'px'}
- Min-height: {size:650,unit:'px'}
- Padding: {top:'80',right:'0',bottom:'80',left:'0',unit:'px'}
- **Row container** with 2 children (will auto-split 50/50):

  **Left column** (text content, align_items='flex-start'):
  - Small label text: "EMERGENCY PLUMBING? WE'RE ON IT." — color=#F59E0B, size=14px, uppercase, letter-spacing
  - Main heading: "Expert Plumbing Solutions You Can Trust" — color=#FFFFFF, size=48px, weight=800, uppercase
  - Subtext paragraph: 2-3 sentences about FlowFix — color=#E5E7EB, size=18px
  - Row container with:
    - CTA button: "Call Now: (555) 123-4567" — background_color=#F59E0B, text_color=#111827, border_radius={top:30,right:30,bottom:30,left:30,unit:'px'}, padding
    - Small text: "5.0 ★★★★★ · 2,400+ Jobs" — color=#FFFFFF

  **Right column** (booking form card):
  - Inner container with background_background='classic', background_color='#FFFFFF', border_radius={top:16,right:16,bottom:16,left:16,unit:'px'}, padding={top:40,right:35,bottom:40,left:35,unit:'px'}
  - Heading: "Book a Service" — color=#1B4D7A, size=24px, weight=700, align=center
  - Small text: "Get a free estimate within 24 hours" — color=#4B5563, align=center
  - **Form widget** (if Elementor Pro) with fields:
    - Full Name (text, required, placeholder="Your Full Name")
    - Phone Number (tel, required, placeholder="(555) 000-0000")
    - Email Address (email, required, placeholder="email@example.com")
    - Service Needed (select: Pipe Repair, Leak Detection, Drain Cleaning, Water Heater, Emergency Service, Bathroom Renovation, Other)
    - Preferred Date (date field)
    - Brief Description (textarea, placeholder="Describe your plumbing issue...")
    - Submit button: "Request Free Estimate" — background_color=#F59E0B, text_color=#111827, full-width, border_radius, font-weight bold
  - Small trust text below form: "Your information is secure. We respond within 2 hours." — color=#6B7280, size=12px, align=center

### 2. TRUST BAR (quick stats ribbon)
- Background: background_background='classic', background_color='#1B4D7A'
- Padding: {top:'25',right:'0',bottom:'25',left:'0',unit:'px'}
- Row container with 4 children (equal width):
  - Each child: centered column container with:
    - Counter widget or heading: "15+" / "2,400+" / "24/7" / "100%" — color=#FFFFFF, size=28px, weight=800
    - Small text: "Years Experience" / "Jobs Completed" / "Emergency Service" / "Satisfaction Rate" — color=#CBD5E1, size=13px, uppercase, letter-spacing

### 3. SERVICES SECTION (6 icon boxes in 3x2 grid)
- Section background: background_background='classic', background_color='#F3F4F6'
- Padding: {top:'80',right:'0',bottom:'80',left:'0',unit:'px'}
- Section subtitle: "OUR SERVICES" — centered, color=#F59E0B, size=14px, uppercase, letter-spacing
- Section heading: "Professional Plumbing Services for Every Need" — centered, color=#1B4D7A, size=36px, uppercase
- Gap: {column:20, row:20, unit:'px'}
- Row 1: 3-column row container, each child is a column container with:
  - White card background (background_background='classic', background_color='#FFFFFF')
  - Border radius, padding={top:40,right:30,bottom:40,left:30,unit:px}, center-aligned
  - SVG icon (circular amber background), heading (h3, #1B4D7A), description text (#4B5563)
  - Services: Pipe Repair & Installation | Leak Detection | Drain Cleaning
- Row 2: Same pattern with: Water Heater Service | Emergency Plumbing | Bathroom Renovation

### 4. ABOUT SECTION (2 columns: image left, content right)
- Section background: background_background='classic', background_color='#FFFFFF'
- Padding: {top:'80',right:'0',bottom:'80',left:'0',unit:'px'}
- Row container with 2 children (50% each auto):
  - Left column: Image widget using sideloaded about image, border_radius
  - Right column (text-align left, do NOT center-align):
    - Subtitle: "ABOUT FLOWFIX" — color=#F59E0B, uppercase
    - Heading: "Your Trusted Local Plumbing Experts" — color=#1B4D7A
    - Text paragraph: Company story, 15+ years, licensed team — color=#4B5563
    - Stats row (inner row container with 3 children):
      - "15+" / "Years Experience"
      - "5K+" / "Projects Done"
      - "24/7" / "Availability"
      Each stat: heading (color=#1B4D7A, bold) + small text below (color=#4B5563)

### 5. CTA BANNER SECTION
- Background: background_background='classic', background_color='#1B4D7A'
- Padding: {top:'60',right:'0',bottom:'60',left:'0',unit:'px'}
- Row container:
  - Left (text): Heading "Ready to Fix Your Plumbing?" color=#FFFFFF + subtext color=#CBD5E1
  - Right: Button "Call Now: (555) 123-4567" — background_color=#F59E0B, text_color=#111827, large, rounded

### 6. PROJECTS GALLERY
- Section background: background_background='classic', background_color='#F3F4F6'
- Padding: {top:'80',right:'0',bottom:'80',left:'0',unit:'px'}
- Subtitle + Heading centered
- Row container with 3 columns (first row), each containing an image widget with the sideloaded gallery images
- Second row container with 3 more gallery images
- Each image: border_radius, object-fit cover

### 7. PRICING SECTION (3 price cards)
- Section background: background_background='classic', background_color='#FFFFFF'
- Padding: {top:'80',right:'0',bottom:'80',left:'0',unit:'px'}
- Subtitle + Heading centered
- Row container with 3 children (cards):
  - Each card: white background, border (border_border='solid', border_width={top:1,right:1,bottom:1,left:1,unit:'px'}, border_color='#E5E7EB'), border_radius, padding
  - Plan name heading, price heading (large, color=#1B4D7A), feature list (icon-list widget with checkmarks), CTA button
  - Plans: Basic ($89), Standard ($149 — FEATURED with amber border-top or background accent), Premium ($249)
  - Featured card: slightly different styling (accent border or background tint)

### 8. TESTIMONIALS SECTION
- Background: background_background='classic', background_color='#F3F4F6'
- Padding: {top:'80',right:'0',bottom:'80',left:'0',unit:'px'}
- Subtitle + Heading centered
- Row container with 3 testimonial cards:
  - Each card: white background, padding, border_radius
  - Star rating (5 stars, color=#F59E0B)
  - Quote text in italics — color=#4B5563
  - Customer name (bold, #111827) + "Verified Customer" in smaller text (#6B7280)

### 9. CONTACT SECTION (2 columns: info left, map right)
- Background: background_background='classic', background_color='#1B4D7A'
- Padding: {top:'80',right:'0',bottom:'80',left:'0',unit:'px'}
- Row container:
  - Left: Heading "Get In Touch" color=#FFFFFF, text with phone/email/address info color=#CBD5E1, social icons
  - Right: Google Maps widget with a real US address or a contact info card

### 10. FOOTER (4 columns)
- Background: background_background='classic', background_color='#0F172A'
- Padding: {top:'60',right:'0',bottom:'60',left:'0',unit:'px'}
- Row container with 4 children:
  - Col 1: Company name heading, brief description, social icons — all color=#94A3B8 / #FFFFFF
  - Col 2: "Quick Links" heading + text list (Home, About, Services, Projects) — color=#94A3B8
  - Col 3: "Services" heading + text list (Pipe Repair, Leak Detection, etc.) — color=#94A3B8
  - Col 4: "Contact" heading + address, phone, email — color=#94A3B8
- Divider widget (color=#1E293B)
- Copyright text centered: "© 2026 FlowFix Plumbing. All rights reserved." — color=#64748B

## CUSTOM CSS — APPLY AFTER PAGE IS BUILT
After the page structure is built, use the `add-custom-css` tool to add these enhancements. Use page-level CSS (omit element_id) for global page styles, or element-level CSS (with element_id) for targeted effects.

### Page-Level Custom CSS (apply to page, no element_id):
```css
/* Smooth scroll behavior */
html { scroll-behavior: smooth; }

/* Form field focus styling */
.elementor-field-group input:focus,
.elementor-field-group select:focus,
.elementor-field-group textarea:focus {
  border-color: #F59E0B !important;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.15) !important;
  outline: none;
}

/* Button hover animations */
.elementor-button {
  transition: all 0.3s ease !important;
}
.elementor-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0,0,0,0.15);
}

/* Image hover zoom in gallery */
.elementor-image img {
  transition: transform 0.5s ease;
}
.elementor-image:hover img {
  transform: scale(1.05);
}
```

### Element-Level Custom CSS — Service Cards (apply to each service card container with element_id):
```css
selector {
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}
selector:hover {
  transform: translateY(-8px);
  box-shadow: 0 20px 40px rgba(0,0,0,0.1);
}
```

### Element-Level CSS — Booking Form Container:
```css
selector {
  box-shadow: 0 25px 60px rgba(0,0,0,0.3);
  backdrop-filter: blur(10px);
}
```

### Element-Level CSS — Featured Pricing Card (Standard plan):
```css
selector {
  border-top: 4px solid #F59E0B;
  box-shadow: 0 15px 50px rgba(245, 158, 11, 0.15);
  transform: scale(1.03);
}
selector:hover {
  transform: scale(1.06);
  box-shadow: 0 20px 60px rgba(245, 158, 11, 0.25);
}
```

### Element-Level CSS — Testimonial Cards:
```css
selector {
  transition: transform 0.3s ease;
}
selector:hover {
  transform: translateY(-5px);
}
```

## CUSTOM JAVASCRIPT — APPLY AFTER PAGE IS BUILT
After the page is built, use the `add-custom-js` tool to add interactivity. Insert the JS into the footer container (or the last top-level container). Set wrap_dom_ready=true.

### Scroll-Triggered Animations (add-custom-js, wrap_dom_ready=true):
```javascript
// Animate elements as they scroll into view
const observerOptions = {
  threshold: 0.15,
  rootMargin: '0px 0px -50px 0px'
};

const fadeInObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
      fadeInObserver.unobserve(entry.target);
    }
  });
}, observerOptions);

// Target all section headings and cards
document.querySelectorAll('.elementor-heading-title, .elementor-icon-box-wrapper, .elementor-image, .elementor-price-table').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(30px)';
  el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
  fadeInObserver.observe(el);
});

// Animate counters in the trust bar
const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const el = entry.target;
      const text = el.textContent;
      const match = text.match(/(\d+)/);
      if (match) {
        const target = parseInt(match[1]);
        const suffix = text.replace(match[1], '');
        let current = 0;
        const increment = Math.ceil(target / 40);
        const timer = setInterval(() => {
          current += increment;
          if (current >= target) {
            current = target;
            clearInterval(timer);
          }
          el.textContent = current + suffix;
        }, 30);
      }
      counterObserver.unobserve(el);
    }
  });
}, { threshold: 0.5 });

document.querySelectorAll('.elementor-counter-number-wrapper, .elementor-heading-title').forEach(el => {
  if (/^\d/.test(el.textContent.trim())) {
    counterObserver.observe(el);
  }
});
```

## SITE-WIDE CODE SNIPPET (Optional — Pro only)
If Elementor Pro is available, use `add-code-snippet` to create a global snippet:
- Title: "FlowFix - Smooth Scroll & Preload"
- Location: head
- Priority: 1
- Code:
```html
<style>
  html { scroll-behavior: smooth; }
  body { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
</style>
<link rel="preconnect" href="https://fonts.googleapis.com">
```

## EXECUTION ORDER
1. **Search & sideload** all 8 images first
2. **Upload SVG icons** using upload-svg-icon tool
3. **Build the page** using build-page with the complete structure
4. **Apply page-level CSS** using add-custom-css (no element_id)
5. **Apply element-level CSS** using add-custom-css with element_id for: service cards, booking form container, featured pricing card, testimonial cards
6. **Inject custom JS** using add-custom-js with wrap_dom_ready=true into the footer container
7. **Create site-wide snippet** using add-code-snippet (optional, Pro only)

## FINAL CHECKLIST
- Every container with a background color MUST have both background_background='classic' AND background_color set
- All text colors must be explicitly set with color='#hex'
- NO flex_wrap or _flex_size anywhere in the structure
- All images must be real sideloaded images, not placeholders
- Use SVG icons, not Elementor icon library
- Hero is 2-column: text left, booking form right
- After build-page completes, apply custom CSS to page-level and individual elements (service cards, form, pricing featured card, testimonials)
- After CSS, inject custom JS for scroll animations and counter effects using add-custom-js with wrap_dom_ready=true
- Optionally create a site-wide code snippet for smooth scroll and font smoothing
- Publish the page as draft
