import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Sep1TomlData } from '@/types';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../anchors', () => ({
  getCorridorById: vi.fn(),
  getAnchorsByCorridorId: vi.fn(),
}));

vi.mock('../sep1', () => ({
  resolveAnchor: vi.fn(),
}));

vi.mock('../sep38', () => ({
  assertSep38Capable: vi.fn(),
  getSep38Price: vi.fn(),
}));

vi.mock('../sep24', () => ({
  getSep24Info: vi.fn(),
}));

vi.mock('../sep6', () => ({
  getSep6Info: vi.fn(),
}));

vi.mock('@/lib/fx/rates', () => ({
  getUsdFxRate: vi.fn(),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { fetchCorridorRates } from '../server-rates';
import { getCorridorById, getAnchorsByCorridorId } from '../anchors';
import { resolveAnchor } from '../sep1';
import { assertSep38Capable } from '../sep38';
import { getSep24Info } from '../sep24';
import { getSep6Info } from '../sep6';
import { getUsdFxRate } from '@/lib/fx/rates';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeToml(overrides: Partial<Sep1TomlData> = {}): Sep1TomlData {
  return {
    domain: 'test.anchor.com',
    TRANSFER_SERVER: null,
    TRANSFER_SERVER_SEP0024: null,
    ANCHOR_QUOTE_SERVER: null,
    WEB_AUTH_ENDPOINT: null,
    SIGNING_KEY: null,
    NETWORK_PASSPHRASE: null,
    ORG_URL: null,
    ORG_SUPPORT_EMAIL: null,
    ORG_SUPPORT_URL: null,
    CURRENCIES: [],
    capabilities: { sep6: false, sep10: false, sep24: false, sep38: false, sep12: false },
    ...overrides,
  };
}

const ANCHOR = { id: 'cowrie', name: 'Cowrie', homeDomain: 'cowrie.exchange', corridors: ['usdc-ngn'], assetCode: 'USDC', assetIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' };
const CORRIDOR = { id: 'usdc-ngn', from: 'USDC', to: 'NGN', countryCode: 'NG', countryName: 'Nigeria' };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('fetchCorridorRates — Tier-3 SEP-6 fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCorridorById).mockReturnValue(CORRIDOR);
    vi.mocked(getAnchorsByCorridorId).mockReturnValue([ANCHOR]);
    vi.mocked(assertSep38Capable).mockImplementation(() => {
      throw new Error('no SEP-38');
    });
    vi.mocked(getSep24Info).mockRejectedValue(new Error('no SEP-24 transfer server'));
    vi.mocked(getUsdFxRate).mockResolvedValue(1600);
  });

  it('returns a rate from SEP-6 when SEP-38 and SEP-24 both fail', async () => {
    const sep6Toml = makeToml({
      TRANSFER_SERVER: 'https://cowrie.exchange/sep6',
      capabilities: { sep6: true, sep10: false, sep24: false, sep38: false, sep12: false },
    });
    vi.mocked(resolveAnchor).mockResolvedValue(sep6Toml);
    vi.mocked(getSep6Info).mockResolvedValue({
      enabled: true,
      feeFixed: 1,
      feePercent: 0,
      min: 0,
      max: 0,
      fields: {},
    });

    const result = await fetchCorridorRates('usdc-ngn', '100');

    expect(result.rates).toHaveLength(1);
    expect(result.rates[0].source).toBe('sep6-fee');
    expect(result.rates[0].anchorId).toBe('cowrie');
    expect(result.errors).toHaveLength(0);
  });

  it('records correct totalReceived using SEP-6 fee', async () => {
    const sep6Toml = makeToml({
      TRANSFER_SERVER: 'https://cowrie.exchange/sep6',
      capabilities: { sep6: true, sep10: false, sep24: false, sep38: false, sep12: false },
    });
    vi.mocked(resolveAnchor).mockResolvedValue(sep6Toml);
    vi.mocked(getSep6Info).mockResolvedValue({
      enabled: true,
      feeFixed: 2,
      feePercent: 0,
      min: 0,
      max: 0,
      fields: {},
    });
    vi.mocked(getUsdFxRate).mockResolvedValue(1600);

    const result = await fetchCorridorRates('usdc-ngn', '100');

    // (100 - 2) * 1600 = 156800
    expect(result.rates[0].totalReceived).toBeCloseTo(156800);
  });

  it('pushes to errors when all three tiers fail', async () => {
    const noSep6Toml = makeToml({
      capabilities: { sep6: false, sep10: false, sep24: false, sep38: false, sep12: false },
    });
    vi.mocked(resolveAnchor).mockResolvedValue(noSep6Toml);

    const result = await fetchCorridorRates('usdc-ngn', '100');

    expect(result.rates).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].anchorId).toBe('cowrie');
    expect(result.errors[0].reason).toContain('SEP-38');
    expect(result.errors[0].reason).toContain('Indicative');
  });

  it('does not attempt SEP-6 when anchor has no TRANSFER_SERVER', async () => {
    const tomlNoSep6 = makeToml({
      TRANSFER_SERVER: null,
      capabilities: { sep6: false, sep10: false, sep24: false, sep38: false, sep12: false },
    });
    vi.mocked(resolveAnchor).mockResolvedValue(tomlNoSep6);

    await fetchCorridorRates('usdc-ngn', '100');

    expect(getSep6Info).not.toHaveBeenCalled();
  });
});
