Create a stunning, animated portfolio landing page for "Alex Rivera" — a creative web developer & UI designer.

## CRITICAL LAYOUT RULES
- For side-by-side columns, use a parent container with flex_direction=row. Children will auto-get content_width=full with equal percentage widths.
- NEVER set flex_wrap or _flex_size in any container settings — these are stripped automatically and cause layout issues.
- NEVER set _flex_size: 'grow' on any element.
- Top-level containers should use content_width=boxed (default).
- Do NOT manually set content_width or width on row children — the build-page tool calculates these automatically.

## DESIGN SYSTEM (use consistently across ALL sections)

### Color Palette
- Primary: #6C3CE1 (electric purple)
- Primary Light: #8B5CF6 (lighter purple for gradients)
- Accent: #00E5A0 (neon mint green)
- Accent Dark: #00CC8E (darker mint for hover)
- Dark: #0A0A0F (near-black background)
- Dark Surface: #13131A (card backgrounds)
- Dark Elevated: #1C1C27 (elevated card/hover)
- Light Text: #FFFFFF
- Body Text: #9CA3AF (muted gray)
- Muted: #6B7280 (subtle text)
- Border: #2D2D3A (subtle borders)

### Typography
- Headings: bold (700-800 weight), NO uppercase (modern lowercase aesthetic)
- Section subtitles: uppercase, letter-spacing=3px, smaller size, color=accent (#00E5A0)
- Body text: size 16-17px, color=#9CA3AF, line-height 1.8
- Code/mono elements: use monospace font styling where appropriate

### Background Colors on Containers
- Set background_background='classic' AND background_color='#hex' — both are required
- For overlays: background_overlay_background='classic', background_overlay_color='#hex', background_overlay_opacity={size:0.85,unit:'px'}

## IMAGE SOURCING — DO THIS FIRST
Before building the page, use the search-images and sideload-image tools to download these images into the Media Library:
1. "abstract dark code background technology" — for hero background
2. "modern website design mockup laptop" — for project 1
3. "mobile app ui design colorful" — for project 2
4. "ecommerce website elegant design" — for project 3
5. "dashboard analytics dark theme" — for project 4
6. "creative agency website modern" — for project 5
7. "branding design portfolio mockup" — for project 6
8. "professional headshot developer casual" — for about section

Use the actual sideloaded image IDs and URLs in the page structure. Do NOT use placeholder URLs.

## SVG ICONS — USE THESE INSTEAD OF ELEMENTOR LIBRARY
Use the upload-svg-icon tool or inline SVG in HTML widgets for icons. Do NOT use Elementor's default icon library (fa-solid, eicon, etc.). Design simple, clean line-style SVG icons for:
- Code brackets icon (</> hero)
- Layout/grid icon (UI design)
- Rocket icon (performance)
- Palette icon (design)
- Terminal icon (development)
- Globe icon (web)
- GitHub icon (social)
- LinkedIn icon (social)
- Mail icon (contact)
- Arrow icon (CTAs)

## PAGE STRUCTURE

### 1. HERO SECTION (2-column: text left, code animation right)
Full-width container with:
- Background: background_background='classic', background_color='#0A0A0F'
- Min-height: {size:700,unit:'px'}
- Padding: {top:'100',right:'0',bottom:'100',left:'0',unit:'px'}
- **Row container** with 2 children:

  **Left column** (text content, align_items='flex-start'):
  - Small label: "Hi, I'm Alex Rivera" — color=#00E5A0, size=16px, letter-spacing
  - Main heading: "I build digital experiences that people love" — color=#FFFFFF, size=52px, weight=800
  - Subtext: "Full-stack developer & UI designer specializing in React, Node.js, and creative web experiences. Turning complex problems into elegant, intuitive interfaces." — color=#9CA3AF, size=18px
  - Row container with gap:
    - CTA button: "View My Work" — background_color=#6C3CE1, text_color=#FFFFFF, border_radius={top:8,right:8,bottom:8,left:8,unit:'px'}
    - Secondary button: "Download CV" — background_color=transparent, text_color=#00E5A0, border_border='solid', border_width={top:2,right:2,bottom:2,left:2,unit:'px'}, border_color='#00E5A0', border_radius
  - Row container with social icons (GitHub, LinkedIn, Twitter) — color=#6B7280

  **Right column** (code/visual element):
  - HTML widget with a styled code snippet block (dark terminal look with syntax-highlighted code using inline CSS):
    ```html
    <div style="background:#13131A;border-radius:12px;padding:30px;border:1px solid #2D2D3A;font-family:monospace;font-size:14px;line-height:1.8;">
      <div style="margin-bottom:15px;">
        <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#FF5F57;margin-right:8px;"></span>
        <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#FFBD2E;margin-right:8px;"></span>
        <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#28C840;"></span>
      </div>
      <code>
        <span style="color:#C084FC;">const</span> <span style="color:#00E5A0;">developer</span> = {<br>
        &nbsp;&nbsp;name: <span style="color:#FDE68A;">'Alex Rivera'</span>,<br>
        &nbsp;&nbsp;skills: [<span style="color:#FDE68A;">'React'</span>, <span style="color:#FDE68A;">'Node.js'</span>, <span style="color:#FDE68A;">'TypeScript'</span>],<br>
        &nbsp;&nbsp;passion: <span style="color:#FDE68A;">'Building the future'</span>,<br>
        &nbsp;&nbsp;<span style="color:#C084FC;">available</span>: <span style="color:#00E5A0;">true</span><br>
        };
      </code>
    </div>
    ```

### 2. TECH STACK BAR (scrolling logos ribbon)
- Background: background_background='classic', background_color='#13131A'
- Border top/bottom: border_border='solid', border_width={top:1,right:0,bottom:1,left:0,unit:'px'}, border_color='#2D2D3A'
- Padding: {top:'30',right:'0',bottom:'30',left:'0',unit:'px'}
- Row container with 6-8 children (equal width):
  - Each child: centered column with HTML widget containing tech logo SVG + label text
  - Technologies: React | Node.js | TypeScript | Figma | Next.js | Tailwind CSS | PostgreSQL | AWS
  - Each label: color=#6B7280, size=13px, uppercase, letter-spacing

### 3. PROJECTS SECTION (featured work — alternating 2-column layouts)
- Background: background_background='classic', background_color='#0A0A0F'
- Padding: {top:'100',right:'0',bottom:'100',left:'0',unit:'px'}
- Section subtitle: "FEATURED WORK" — color=#00E5A0, size=13px, uppercase, letter-spacing=3px, centered
- Section heading: "Projects I'm proud of" — color=#FFFFFF, size=40px, centered
- Gap between projects: {row:60, unit:'px'}

  **Project 1** — Row container (image left, text right):
  - Left: Image widget with sideloaded mockup, border_radius={top:12,right:12,bottom:12,left:12,unit:'px'}
  - Right (align_items='flex-start'):
    - Small tag: "WEB APP" — color=#00E5A0, size=12px, uppercase
    - Heading: "SaaS Analytics Dashboard" — color=#FFFFFF, size=28px
    - Description text — color=#9CA3AF
    - Row with tech tags: HTML widgets styled as pills (background=#1C1C27, color=#9CA3AF, border-radius, padding)
    - Button: "View Project →" — text_color=#6C3CE1, background=transparent

  **Project 2** — Row container (text left, image right — reversed):
  - Same pattern but mirrored

  **Project 3** — Row container (image left, text right):
  - Same pattern

### 4. SERVICES SECTION (4 cards in a row)
- Background: background_background='classic', background_color='#13131A'
- Padding: {top:'100',right:'0',bottom:'100',left:'0',unit:'px'}
- Section subtitle + heading centered
- Row container with 4 children:
  - Each card: column container with background_background='classic', background_color='#1C1C27', border_border='solid', border_width={top:1,right:1,bottom:1,left:1,unit:'px'}, border_color='#2D2D3A', border_radius={top:12,right:12,bottom:12,left:12,unit:'px'}, padding={top:40,right:30,bottom:40,left:30,unit:'px'}
  - SVG icon in accent color, heading (#FFFFFF), description (#9CA3AF)
  - Services: Frontend Development | Backend & APIs | UI/UX Design | Performance Optimization

### 5. ABOUT SECTION (2-column: image left, text right)
- Background: background_background='classic', background_color='#0A0A0F'
- Padding: {top:'100',right:'0',bottom:'100',left:'0',unit:'px'}
- Row container:
  - Left: Image widget with headshot, border_radius, styled with a purple gradient border effect
  - Right (align_items='flex-start'):
    - Subtitle: "ABOUT ME" — color=#00E5A0
    - Heading: "Crafting code with creativity" — color=#FFFFFF
    - Bio paragraphs — color=#9CA3AF
    - Stats row (inner row, 3 children):
      - "50+" / "Projects Completed" — heading color=#FFFFFF, text color=#6B7280
      - "5+" / "Years Experience"
      - "30+" / "Happy Clients"

### 6. TESTIMONIALS SECTION (3 cards)
- Background: background_background='classic', background_color='#13131A'
- Padding: {top:'100',right:'0',bottom:'100',left:'0',unit:'px'}
- Subtitle + heading centered
- Row container with 3 children:
  - Each card: dark card (background_color='#1C1C27'), border, border_radius, padding
  - Star rating (5 stars, color=#FDE68A)
  - Quote text in italics — color=#9CA3AF
  - Client name (#FFFFFF, bold) + role/company (#6B7280)

### 7. CTA / CONTACT SECTION
- Background: background_background='classic', background_color='#0A0A0F'
- Padding: {top:'100',right:'0',bottom:'100',left:'0',unit:'px'}
- Centered content:
  - Subtitle: "LET'S CONNECT" — color=#00E5A0
  - Heading: "Have a project in mind?" — color=#FFFFFF, size=44px
  - Subtext: "I'm currently available for freelance work and exciting collaborations." — color=#9CA3AF
  - Row with buttons:
    - "Start a Conversation" — background_color=#6C3CE1, text_color=#FFFFFF
    - "alex@example.com" — text_color=#00E5A0, background=transparent
  - Social icons row: GitHub, LinkedIn, Twitter, Dribbble — color=#6B7280

### 8. FOOTER
- Background: background_background='classic', background_color='#0A0A0F'
- Border top: border_border='solid', border_width={top:1,right:0,bottom:0,left:0,unit:'px'}, border_color='#2D2D3A'
- Padding: {top:'40',right:'0',bottom:'40',left:'0',unit:'px'}
- Row container:
  - Left: "Designed & built by Alex Rivera" — color=#6B7280
  - Right: "© 2026 All rights reserved." — color=#6B7280

## CUSTOM CSS — APPLY AFTER PAGE IS BUILT
After the page structure is built, use the `add-custom-css` tool to add these enhancements.

### Page-Level Custom CSS (no element_id):
```css
/* Smooth scroll */
html { scroll-behavior: smooth; }

/* Custom cursor glow effect */
body { cursor: default; }

/* Gradient text effect for headings */
.gradient-text {
  background: linear-gradient(135deg, #6C3CE1 0%, #00E5A0 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

/* Button hover glow */
.elementor-button {
  transition: all 0.3s ease !important;
}
.elementor-button:hover {
  box-shadow: 0 0 30px rgba(108, 60, 225, 0.4);
  transform: translateY(-2px);
}

/* Card hover effects */
.elementor-image img {
  transition: transform 0.5s ease;
}
.elementor-image:hover img {
  transform: scale(1.03);
}

/* Glowing border animation */
@keyframes borderGlow {
  0%, 100% { border-color: #2D2D3A; }
  50% { border-color: #6C3CE1; }
}

/* Typing cursor blink for code block */
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
.typing-cursor::after {
  content: '|';
  animation: blink 1s infinite;
  color: #00E5A0;
}
```

### Element-Level CSS — Service Cards:
```css
selector {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
selector:hover {
  transform: translateY(-10px);
  border-color: #6C3CE1;
  box-shadow: 0 20px 60px rgba(108, 60, 225, 0.15);
}
```

### Element-Level CSS — Project Image Containers:
```css
selector {
  overflow: hidden;
  border-radius: 12px;
}
selector img {
  transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}
selector:hover img {
  transform: scale(1.05);
}
```

### Element-Level CSS — Code Block Container (hero right):
```css
selector {
  box-shadow: 0 0 80px rgba(108, 60, 225, 0.15), 0 0 30px rgba(0, 229, 160, 0.1);
  transition: box-shadow 0.5s ease;
}
selector:hover {
  box-shadow: 0 0 100px rgba(108, 60, 225, 0.25), 0 0 50px rgba(0, 229, 160, 0.15);
}
```

### Element-Level CSS — Testimonial Cards:
```css
selector {
  transition: transform 0.3s ease, border-color 0.3s ease;
}
selector:hover {
  transform: translateY(-5px);
  border-color: #00E5A0;
}
```

## CUSTOM JAVASCRIPT — APPLY AFTER PAGE IS BUILT
Use `add-custom-js` with wrap_dom_ready=true. Insert into the footer container.

### Scroll-Triggered Animations + Parallax (add-custom-js, wrap_dom_ready=true):
```javascript
// Intersection Observer for fade-in animations
const fadeObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
      fadeObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

// Apply fade-in to sections, cards, and headings
document.querySelectorAll('.elementor-heading-title, .elementor-icon-box-wrapper, .elementor-image, .e-con > .e-con').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(40px)';
  el.style.transition = 'opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1), transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
  fadeObserver.observe(el);
});

// Staggered animation for tech stack items
const techItems = document.querySelectorAll('.elementor-widget-html');
techItems.forEach((item, index) => {
  item.style.opacity = '0';
  item.style.transform = 'translateY(20px)';
  item.style.transition = `opacity 0.5s ease ${index * 0.1}s, transform 0.5s ease ${index * 0.1}s`;
});
const techObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, { threshold: 0.3 });
techItems.forEach(item => techObserver.observe(item));

// Counter animation for stats
const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const el = entry.target;
      const text = el.textContent.trim();
      const match = text.match(/(\d+)/);
      if (match) {
        const target = parseInt(match[1]);
        const suffix = text.replace(match[1], '');
        let current = 0;
        const increment = Math.ceil(target / 30);
        const timer = setInterval(() => {
          current += increment;
          if (current >= target) { current = target; clearInterval(timer); }
          el.textContent = current + suffix;
        }, 40);
      }
      counterObserver.unobserve(el);
    }
  });
}, { threshold: 0.5 });

document.querySelectorAll('.elementor-heading-title').forEach(el => {
  if (/^\d/.test(el.textContent.trim())) counterObserver.observe(el);
});

// Smooth parallax on scroll for hero
let ticking = false;
window.addEventListener('scroll', () => {
  if (!ticking) {
    requestAnimationFrame(() => {
      const scrolled = window.scrollY;
      const hero = document.querySelector('.elementor-element[data-element_type="container"]');
      if (hero && scrolled < 800) {
        hero.style.transform = `translateY(${scrolled * 0.15}px)`;
      }
      ticking = false;
    });
    ticking = true;
  }
});
```

### Typing Animation for Code Block (add-custom-js, wrap_dom_ready=true — separate call):
```javascript
// Typewriter effect for the code block
const codeBlock = document.querySelector('.elementor-widget-html code');
if (codeBlock) {
  const originalHTML = codeBlock.innerHTML;
  codeBlock.innerHTML = '';
  codeBlock.style.display = 'block';
  let i = 0;
  const chars = originalHTML.split('');
  let insideTag = false;
  let buffer = '';

  function typeNext() {
    if (i >= chars.length) return;
    const char = chars[i];
    if (char === '<') insideTag = true;
    if (insideTag) {
      buffer += char;
      if (char === '>') {
        insideTag = false;
        codeBlock.innerHTML += buffer;
        buffer = '';
      }
    } else {
      codeBlock.innerHTML += char;
    }
    i++;
    setTimeout(typeNext, char === '\n' ? 100 : 15);
  }

  // Start typing when code block is visible
  const codeObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      setTimeout(typeNext, 500);
      codeObserver.disconnect();
    }
  }, { threshold: 0.5 });
  codeObserver.observe(codeBlock.closest('.elementor-widget'));
}
```

## LOTTIE ANIMATIONS (Pro only — use add-lottie tool)
If Elementor Pro is available, add Lottie animations for visual flair:
1. **Hero section** — Add a Lottie animation widget next to or behind the code block. Use a "coding/development" themed Lottie from LottieFiles (provide a public Lottie JSON URL). Settings: loop=true, autoplay=true, hover_action='none'.
2. **Contact section** — Add a "rocket launch" or "envelope flying" Lottie animation near the CTA heading.
3. **Loading/transition** — A subtle abstract animation between sections.

For Lottie URLs, search LottieFiles for:
- "coding animation" → use for hero
- "rocket launch" → use for contact CTA
- "abstract geometric loop" → use for section dividers

## SITE-WIDE CODE SNIPPET (Optional — Pro only)
Use `add-code-snippet` to create a global snippet:
- Title: "Portfolio - Custom Cursor & Smooth Scroll"
- Location: head
- Priority: 1
- Code:
```html
<style>
  html { scroll-behavior: smooth; }
  body { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
  ::selection { background: #6C3CE1; color: #FFFFFF; }
</style>
```

## EXECUTION ORDER
1. **Search & sideload** all 8 images first
2. **Upload SVG icons** using upload-svg-icon tool
3. **Build the page** using build-page with the complete dark-theme structure
4. **Apply page-level CSS** using add-custom-css (no element_id)
5. **Apply element-level CSS** for: service cards, project images, code block, testimonial cards
6. **Inject scroll animation JS** using add-custom-js with wrap_dom_ready=true
7. **Inject typing animation JS** using add-custom-js (separate call) with wrap_dom_ready=true
8. **Add Lottie animations** if Elementor Pro is available
9. **Create site-wide snippet** using add-code-snippet (optional, Pro only)

## FINAL CHECKLIST
- Every container with a background color MUST have both background_background='classic' AND background_color set
- All text colors must be explicitly set with color='#hex'
- NO flex_wrap or _flex_size anywhere in the structure
- All images must be real sideloaded images, not placeholders
- Use SVG icons, not Elementor icon library
- Dark theme throughout — no white backgrounds
- Code block in hero has terminal-style styling with syntax highlighting
- Service cards have hover glow effects via custom CSS
- Scroll-triggered fade-in animations via custom JS
- Typing animation on the hero code block via custom JS
- Lottie animations added if Pro is available
- Publish the page as draft
