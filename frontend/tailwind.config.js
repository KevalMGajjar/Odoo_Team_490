/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    // Deliberately NOT extending Tailwind's default scale — an accounting
    // app needs a small, disciplined set of tokens, not 40 shadow variants.
    fontFamily: {
      sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
    },
    fontSize: {
      xs: ['11px', { lineHeight: '16px' }],
      sm: ['13px', { lineHeight: '19px' }], // body — ERP density, not 16px web-app text
      base: ['13px', { lineHeight: '19px' }],
      md: ['15px', { lineHeight: '21px' }], // section titles
      lg: ['18px', { lineHeight: '24px' }], // page titles
      xl: ['22px', { lineHeight: '28px' }],
    },
    spacing: {
      // 4/8/12/16/24 is the disciplined scale (UI.md §2), but dense ERP
      // chrome (py-1.5 on a compact input, gap-1.5 in a toolbar) genuinely
      // needs the half-steps too — keep Tailwind's own values for those so
      // nothing that reads naturally in JSX silently resolves to nothing.
      0: '0px', px: '1px',
      0.5: '2px', 1: '4px', 1.5: '6px', 2: '8px', 2.5: '10px', 3: '12px',
      3.5: '14px', 4: '16px', 5: '20px', 6: '24px', 7: '28px',
      8: '32px', 10: '40px', 12: '48px', 14: '56px', 16: '64px', 20: '80px', 24: '96px',
    },
    borderRadius: {
      none: '0px',
      DEFAULT: '4px', // --o-radius
      sm: '3px', // --o-radius-sm — buttons, inputs
      md: '4px',
      full: '9999px',
    },
    boxShadow: {
      none: 'none',
      DEFAULT: '0 2px 6px rgba(0,0,0,.08)', // --o-shadow
      pop: '0 4px 16px rgba(0,0,0,.14)', // --o-shadow-pop — dropdowns, modals
    },
    extend: {
      colors: {
        brand: {
          DEFAULT: 'var(--o-brand)',
          hover: 'var(--o-brand-hover)',
          light: 'var(--o-brand-light)',
        },
        secondary: {
          DEFAULT: 'var(--o-secondary)',
          hover: 'var(--o-secondary-hover)',
        },
        surface: {
          bg: 'var(--o-bg)',
          sheet: 'var(--o-sheet)',
          sidebar: 'var(--o-sidebar)',
          header: 'var(--o-header)',
          subtle: 'var(--o-subtle)',
          hover: 'var(--o-hover)',
        },
        ink: {
          DEFAULT: 'var(--o-text)',
          muted: 'var(--o-text-muted)',
          faint: 'var(--o-text-faint)',
          invert: 'var(--o-text-invert)',
        },
        line: {
          DEFAULT: 'var(--o-border)',
          strong: 'var(--o-border-strong)',
        },
        state: {
          draft: 'var(--o-draft)',
          posted: 'var(--o-posted)',
          paid: 'var(--o-paid)',
          partial: 'var(--o-partial)',
          overdue: 'var(--o-overdue)',
          info: 'var(--o-info)',
        },
        ledger: {
          debit: 'var(--o-debit)',
          credit: 'var(--o-credit)',
        },
      },
      spacing: {
        // sidebar/topbar exact dimensions from UI.md §3, kept out of the base
        // scale so they read as layout constants, not spacing choices
        sidebar: '240px',
        'sidebar-rail': '56px',
        topbar: '44px',
        panel: '48px',
      },
      transitionDuration: {
        150: '150ms',
      },
    },
  },
  plugins: [],
}
