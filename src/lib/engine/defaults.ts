/**
 * Default values for the calculator.
 * Updated monthly based on TCMB, economist estimates, and market data.
 * Users can override all values in the UI.
 *
 * Last updated: 2026-03-15
 */

// ── Common Parameters ───────────────────────────────────────────────
export const DEFAULTS = {
  // Asset
  varlikDegeri: 5_000_000,          // TL
  pesinat: 0,                       // TL

  // Discount rate (yıllık bileşik faiz — mevduat getirisi)
  iskonto: 0.30,                    // 30% annual

  // Asset appreciation (yıllık konut değer artışı)
  konutDegerArtisi: 0.30,           // 30% annual

  // Rent
  aylikKira: 0,                     // TL (user must enter)
  kiraArtisOrani: 0.30,             // 30% annual

  // ── Bank Loan ───────────────────────────────────────────────────
  banka: {
    yillikFaizOrani: 0.0254,        // 2.54% annual (monthly converted in engine)
    vadeSuresi: 120,                // months
    dosyaMasrafi: 0,                // TL
    ekspertizUcreti: 0,             // TL
    ipotekHarciOrani: 0.00455,      // binde 4.55 of loan amount

    // Tax/fee on interest — varies by asset type
    konut: {
      bsmvOrani: 0,                 // Konut kredisi: BSMV istisnası
      kkdfOrani: 0,                 // Konut kredisi: KKDF %0
    },
    arac: {
      bsmvOrani: 0.15,             // Tüketici/araç: %15
      kkdfOrani: 0.15,             // Tüketici/araç: %15
    },

    // Insurance (annual)
    daskYillik: 0,                  // TL
    konutSigortaYillik: 0,          // TL
    hayatSigortaYillik: 0,          // TL
  },

  // ── Evim System ─────────────────────────────────────────────────
  evim: {
    orgUcretOrani: 0.08,           // 8% of financed amount (varies by company/campaign)
    orgUcretPesinOrani: 0.50,      // 50% upfront (BDDK minimum)
    orgUcretTaksitSayisi: 4,       // Max 4 installments for remainder

    // Insurance (annual, post-delivery)
    daskYillik: 0,
    konutSigortaYillik: 0,
    hayatSigortaYillik: 0,
  },

  // ── Self-Save ───────────────────────────────────────────────────
  biriktir: {
    stopajOrani: 0.15,              // 15% withholding tax
    // r_mevduat defaults to iskonto rate
  },
} as const;
