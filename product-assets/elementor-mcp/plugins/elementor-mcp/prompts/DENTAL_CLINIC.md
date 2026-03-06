Create a clean, trustworthy landing page for "BrightSmile Dental" — a modern family dental clinic.

## CRITICAL LAYOUT RULES
- For side-by-side columns, use a parent container with flex_direction=row. Children will auto-get content_width=full with equal percentage widths.
- NEVER set flex_wrap or _flex_size in any container settings — these are stripped automatically and cause layout issues.
- NEVER set _flex_size: 'grow' on any element.
- Top-level containers should use content_width=boxed (default).
- Do NOT manually set content_width or width on row children — the build-page tool calculates these automatically.

## DESIGN SYSTEM (use consistently across ALL sections)

### Color Palette
- Primary: #0EA5E9 (sky blue — clean, medical, trustworthy)
- Primary Dark: #0284C7 (darker blue for hover)
- Accent: #10B981 (fresh mint green — health)
- Accent Light: #D1FAE5 (soft mint for backgrounds)
- Dark: #0F172A (slate-900 for text)
- Light Text: #FFFFFF
- Body Text: #475569 (slate-600)
- Muted: #94A3B8 (slate-400)
- Light BG: #F8FAFC (slate-50, barely-there blue tint)
- Card BG: #FFFFFF
- Border: #E2E8F0 (slate-200)

### Typography
- Headings: weight 700, title case (friendly, professional — not uppercase)
- Section subtitles: uppercase, letter-spacing=3px, size=12px, color=#0EA5E9, weight=600
- Body text: size 16-17px, color=#475569, line-height 1.8
- Friendly, approachable tone — not clinical

### Background Colors on Containers
- Set background_background='classic' AND background_color='#hex' — both are required
- For overlays: background_overlay_background='classic', background_overlay_color='#hex', background_overlay_opacity={size:0.6,unit:'px'}

## IMAGE SOURCING — DO THIS FIRST
Before building the page, use the search-images and sideload-image tools:
1. "dental clinic modern interior bright" — for hero background
2. "dentist patient smiling friendly" — for about section
3. "dental team professional portrait" — for team section
4. "teeth whitening dental cosmetic" — for services
5. "dental chair modern technology" — for facilities
6. "family dentist children smiling" — for family dentistry
7. "dental braces orthodontics" — for services
8. "happy patient dental checkup" — for testimonials/CTA

Use the actual sideloaded image IDs and URLs. Do NOT use placeholder URLs.

## SVG ICONS
Use upload-svg-icon. Do NOT use Elementor's icon library. Clean, friendly medical icons:
- Tooth icon (general dental)
- Smile icon (cosmetic)
- Shield/plus icon (protection/insurance)
- Clock icon (hours)
- Calendar icon (booking)
- Phone icon (emergency)
- Sparkle/shine icon (whitening)
- Heart icon (care)
- Family icon (family dentistry)
- Map pin icon (location)

## PAGE STRUCTURE

### 1. HERO SECTION (2-column: text left, booking form right)
Full-width container:
- Background: sideloaded dental clinic image, background_size='cover', background_position='center center'
- Overlay: background_overlay_color='#0F172A', background_overlay_opacity={size:0.65,unit:'px'}
- Min-height: {size:620,unit:'px'}
- Padding: {top:'80',right:'0',bottom:'80',left:'0',unit:'px'}
- **Row container** with 2 children:

  **Left column** (align_items='flex-start'):
  - Small label: "ACCEPTING NEW PATIENTS" — color=#10B981, size=13px, uppercase, letter-spacing=3px
  - Main heading: "Your Family Deserves the Best Dental Care" — color=#FFFFFF, size=46px, weight=700
  - Subtext: "From routine checkups to cosmetic transformations — BrightSmile Dental combines advanced technology with a gentle touch for the whole family." — color=#E2E8F0, size=18px
  - Row with buttons:
    - "Book Appointment" — background_color=#0EA5E9, text_color=#FFFFFF, border_radius={top:8,right:8,bottom:8,left:8,unit:'px'}
    - "Call: (555) 789-0123" — background=transparent, border_color='#FFFFFF', text_color=#FFFFFF
  - Small text: "Emergency? Call us 24/7" — color=#94A3B8

  **Right column** (appointment form card):
  - Container: background_color='#FFFFFF', border_radius={top:16,right:16,bottom:16,left:16,unit:'px'}, padding={top:35,right:30,bottom:35,left:30,unit:'px'}
  - Heading: "Book Your Visit" — color=#0F172A, size=22px, weight=700, centered
  - Small text: "Same-day appointments available" — color=#475569, centered
  - **Form widget** (if Pro):
    - Full Name (text, required)
    - Phone Number (tel, required)
    - Email (email)
    - Service (select: General Checkup, Teeth Cleaning, Whitening, Braces/Orthodontics, Dental Implants, Emergency, Cosmetic, Other)
    - Preferred Date (date)
    - Insurance Provider (text, placeholder="e.g., Delta Dental")
    - Submit: "Book Appointment" — background_color=#0EA5E9, text_color=#FFFFFF, full-width
  - Trust text: "Your info is secure. We accept most insurance plans." — color=#94A3B8, size=12px, centered

### 2. TRUST BAR (key differentiators)
- Background: background_background='classic', background_color='#FFFFFF'
- Border bottom: border_color='#E2E8F0'
- Padding: {top:'25',right:'0',bottom:'25',left:'0',unit:'px'}
- Row with 4 children:
  - Each: centered row with SVG icon + text
  - "15+ Years Experience" | "10,000+ Happy Patients" | "Same-Day Appointments" | "Insurance Accepted"
  - Icon color=#0EA5E9, text color=#475569, size=14px

### 3. SERVICES SECTION (6 cards in 3x2 grid)
- Background: background_background='classic', background_color='#F8FAFC'
- Padding: {top:'100',right:'0',bottom:'100',left:'0',unit:'px'}
- Subtitle: "OUR SERVICES" — color=#0EA5E9, centered
- Heading: "Comprehensive Dental Care for Every Smile" — color=#0F172A, centered, size=36px
- Row 1: 3 service cards
- Row 2: 3 more service cards

  Each card (column container):
  - background_color='#FFFFFF', border_border='solid', border_color='#E2E8F0', border_radius={top:12,right:12,bottom:12,left:12,unit:'px'}, padding={top:35,right:25,bottom:35,left:25,unit:'px'}
  - SVG icon in circle (background=#D1FAE5 or light blue), heading (#0F172A), description (#475569)

  Services:
  - Row 1: General Dentistry (checkups, cleanings, fillings) | Cosmetic Dentistry (whitening, veneers, bonding) | Orthodontics (braces, Invisalign, retainers)
  - Row 2: Dental Implants (single, bridge, full arch) | Pediatric Dentistry (kid-friendly care, sealants) | Emergency Dental (same-day pain relief, repair)

### 4. ABOUT SECTION (2-column: image left, text right)
- Background: background_background='classic', background_color='#FFFFFF'
- Padding: {top:'100',right:'0',bottom:'100',left:'0',unit:'px'}
- Row container:
  - Left: Image widget (dentist with patient), border_radius
  - Right (align_items='flex-start'):
    - Subtitle: "ABOUT BRIGHTSMILE" — color=#0EA5E9
    - Heading: "A Dental Experience You'll Actually Enjoy" — color=#0F172A
    - Text: 2 paragraphs — modern office, gentle approach, latest technology, family-owned — color=#475569
    - Stats row (3 children):
      - "15+" / "Years of Practice" — heading color=#0F172A, text #475569
      - "10K+" / "Smiles Transformed"
      - "98%" / "Patient Satisfaction"

### 5. TEAM SECTION (4 dentist cards)
- Background: background_background='classic', background_color='#F8FAFC'
- Padding: {top:'100',right:'0',bottom:'100',left:'0',unit:'px'}
- Subtitle: "OUR TEAM" — color=#0EA5E9, centered
- Heading: "Meet Your Dental Care Experts" — color=#0F172A, centered
- Row with 4 children:
  - Each card: white background, border, border_radius, overflow hidden
  - Image widget (team photo), padding on text area
  - Name heading: "Dr. Sarah Mitchell" — color=#0F172A, size=18px, weight=700
  - Specialty: "General & Cosmetic Dentistry" — color=#0EA5E9, size=13px
  - Brief bio text — color=#475569, size=14px
  - Team: Dr. Sarah Mitchell (General & Cosmetic) | Dr. James Chen (Orthodontics) | Dr. Priya Patel (Pediatric) | Dr. Michael Torres (Oral Surgery)

### 6. PRICING / INSURANCE SECTION
- Background: background_background='classic', background_color='#FFFFFF'
- Padding: {top:'100',right:'0',bottom:'100',left:'0',unit:'px'}
- Subtitle: "TRANSPARENT PRICING" — color=#0EA5E9, centered
- Heading: "Affordable Care for Every Budget" — color=#0F172A, centered
- Row with 3 cards:

  Each card: border, border_radius, padding
  - Treatment heading, price (color=#0EA5E9, large), feature list, button

  Plans:
  - "New Patient Special" ($99): Exam, X-rays, Cleaning, Treatment plan — background_color='#D1FAE5' tint
  - "Teeth Whitening" ($299): Professional whitening, Custom trays, Touch-up kit — standard card
  - "Dental Implant" (From $1,499): Consultation, Implant + Crown, Follow-up care — standard card

  Below cards: "We accept most major insurance plans including Delta Dental, Cigna, Aetna, MetLife, and more." — color=#475569, centered

### 7. TESTIMONIALS (3 cards)
- Background: background_background='classic', background_color='#F8FAFC'
- Padding: {top:'100',right:'0',bottom:'100',left:'0',unit:'px'}
- Subtitle + heading centered
- Row with 3 cards:
  - White background, border, border_radius, padding
  - Star rating (color=#FBBF24)
  - Quote — color=#475569
  - Patient name (#0F172A, bold) + "Verified Patient" (#94A3B8)

### 8. CTA SECTION (appointment prompt)
- Background: background_background='classic', background_color='#0EA5E9'
- Padding: {top:'80',right:'0',bottom:'80',left:'0',unit:'px'}
- Centered:
  - Heading: "Ready for a Healthier Smile?" — color=#FFFFFF, size=40px
  - Subtext: "New patients welcome. Same-day appointments available for emergencies." — color=#E0F2FE
  - Row with buttons:
    - "Schedule Online" — background_color=#FFFFFF, text_color=#0EA5E9
    - "Call (555) 789-0123" — border_color='#FFFFFF', text_color=#FFFFFF

### 9. LOCATION / HOURS (2-column)
- Background: background_background='classic', background_color='#FFFFFF'
- Padding: {top:'80',right:'0',bottom:'80',left:'0',unit:'px'}
- Row container:
  - Left:
    - Subtitle: "VISIT US" — color=#0EA5E9
    - Heading: "Conveniently Located" — color=#0F172A
    - Address, phone, email with SVG icons — color=#475569
    - Hours: "Mon-Fri: 8AM-6PM | Sat: 9AM-3PM | Sun: Closed" — color=#475569
    - "Emergency line available 24/7" — color=#10B981
  - Right: Google Maps widget

### 10. FOOTER
- Background: background_background='classic', background_color='#0F172A'
- Padding: {top:'60',right:'0',bottom:'60',left:'0',unit:'px'}
- Row with 4 columns:
  - Col 1: "BrightSmile Dental" + tagline — color=#94A3B8 / #FFFFFF
  - Col 2: "Services" links — color=#94A3B8
  - Col 3: "Patient Info" (New patients, Insurance, Forms, FAQ) — color=#94A3B8
  - Col 4: "Contact" info — color=#94A3B8
- Divider (color=#1E293B)
- Copyright: "© 2026 BrightSmile Dental. All rights reserved." — color=#64748B

## CUSTOM CSS — APPLY AFTER PAGE IS BUILT

### Page-Level CSS (no element_id):
```css
html { scroll-behavior: smooth; }

/* Clean button hover */
.elementor-button {
  transition: all 0.3s ease !important;
}
.elementor-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(14, 165, 233, 0.25);
}

/* Image subtle zoom */
.elementor-image img {
  transition: transform 0.5s ease;
}
.elementor-image:hover img {
  transform: scale(1.03);
}

/* Form field focus */
.elementor-field-group input:focus,
.elementor-field-group select:focus,
.elementor-field-group textarea:focus {
  border-color: #0EA5E9 !important;
  box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1) !important;
  outline: none;
}

/* Blue selection */
::selection {
  background: #0EA5E9;
  color: #FFFFFF;
}
```

### Element-Level CSS — Service Cards:
```css
selector {
  transition: transform 0.35s ease, box-shadow 0.35s ease;
}
selector:hover {
  transform: translateY(-8px);
  box-shadow: 0 15px 40px rgba(14, 165, 233, 0.1);
}
```

### Element-Level CSS — Booking Form Container:
```css
selector {
  box-shadow: 0 25px 50px rgba(0,0,0,0.2);
}
```

### Element-Level CSS — Team Member Cards:
```css
selector {
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  overflow: hidden;
}
selector:hover {
  transform: translateY(-6px);
  box-shadow: 0 15px 40px rgba(0,0,0,0.08);
}
```

### Element-Level CSS — New Patient Special Card:
```css
selector {
  border: 2px solid #10B981;
  position: relative;
}
selector::before {
  content: 'MOST POPULAR';
  position: absolute;
  top: -1px;
  right: 20px;
  background: #10B981;
  color: #FFFFFF;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  padding: 4px 12px;
  border-radius: 0 0 6px 6px;
}
```

### Element-Level CSS — Testimonial Cards:
```css
selector {
  transition: transform 0.3s ease;
}
selector:hover {
  transform: translateY(-4px);
}
```

## CUSTOM JAVASCRIPT — APPLY AFTER PAGE IS BUILT
Use `add-custom-js` with wrap_dom_ready=true.

### Scroll Animations + Counters (add-custom-js, wrap_dom_ready=true):
```javascript
// Gentle fade-in on scroll
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

document.querySelectorAll('.elementor-heading-title, .elementor-image, .elementor-icon-box-wrapper, .elementor-widget-text-editor').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(25px)';
  el.style.transition = 'opacity 0.7s ease, transform 0.7s ease';
  observer.observe(el);
});

// Smooth counter animation
const counterObs = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const el = entry.target;
      const text = el.textContent.trim();
      const match = text.match(/(\d+)/);
      if (match) {
        const target = parseInt(match[1]);
        const suffix = text.replace(/\d+/, '');
        const prefix = text.substring(0, text.indexOf(match[1]));
        let current = 0;
        const duration = 1200;
        const start = performance.now();
        function step(now) {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          current = Math.round(target * eased);
          el.textContent = prefix + current + suffix;
          if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      }
      counterObs.unobserve(el);
    }
  });
}, { threshold: 0.5 });

document.querySelectorAll('.elementor-heading-title').forEach(el => {
  if (/^\d/.test(el.textContent.trim())) counterObs.observe(el);
});

// Highlight active nav section (if applicable)
const sections = document.querySelectorAll('.elementor-element[data-element_type="container"]');
window.addEventListener('scroll', () => {
  const scrollPos = window.scrollY + 200;
  sections.forEach(section => {
    if (section.offsetTop <= scrollPos && (section.offsetTop + section.offsetHeight) > scrollPos) {
      section.style.opacity = '1';
    }
  });
});
```

## SITE-WIDE CODE SNIPPET (Optional — Pro only)
- Title: "BrightSmile - Global Styles"
- Location: head
- Priority: 1
- Code:
```html
<style>
  html { scroll-behavior: smooth; }
  body { -webkit-font-smoothing: antialiased; }
  ::selection { background: #0EA5E9; color: #FFFFFF; }
</style>
```

## EXECUTION ORDER
1. **Search & sideload** all 8 images
2. **Upload SVG icons**
3. **Build the page** using build-page
4. **Apply page-level CSS** (no element_id)
5. **Apply element-level CSS** for: service cards, booking form, team cards, new patient card, testimonials
6. **Inject custom JS** with wrap_dom_ready=true
7. **Create site-wide snippet** (optional, Pro only)

## FINAL CHECKLIST
- Every container with a background color MUST have both background_background='classic' AND background_color set
- All text colors explicitly set
- NO flex_wrap or _flex_size anywhere
- All images real sideloaded images
- Use SVG icons, not Elementor icon library
- Clean, medical-professional aesthetic — blues, whites, soft greens
- Hero has appointment booking form on the right
- Service cards with dental-specific icons
- Team section with 4 dentist profiles
- Pricing is transparent with insurance mention
- Publish the page as draft
