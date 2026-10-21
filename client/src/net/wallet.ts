import { getWallets } from '@wallet-standard/app';
import bs58 from 'bs58';

// ─────────────────────────────────────────────────────────────
//  WALLETS DE SOLANA (solo para iniciar sesión firmando un mensaje).
//  Se detectan con Wallet Standard (Phantom, Solflare, Backpack…). Nunca se pide
//  firmar una transacción ni se mueven fondos.
// ─────────────────────────────────────────────────────────────

export interface WalletOption {
  name: string;
  icon: string;
  /** Conecta y devuelve la dirección + una función para firmar textos. */
  connect(): Promise<{ address: string; sign(message: string): Promise<string> }>;
}

interface StdAccount {
  address: string;
  chains: readonly string[];
}
interface StdWallet {
  name: string;
  icon: string;
  chains: readonly string[];
  accounts: readonly StdAccount[];
  features: Record<string, unknown>;
}
type ConnectFeature = { connect(): Promise<{ accounts: readonly StdAccount[] }> };
type SignFeature = {
  signMessage(
    ...inputs: Array<{ account: StdAccount; message: Uint8Array }>
  ): Promise<Array<{ signature: Uint8Array }>>;
};
interface LegacyProvider {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  connect(): Promise<{ publicKey: { toString(): string } }>;
  signMessage(msg: Uint8Array, enc: 'utf8'): Promise<{ signature: Uint8Array }>;
}

const encode = (s: string) => new TextEncoder().encode(s);

/** Wallets de Solana instaladas en este navegador que pueden firmar mensajes. */
export function availableWallets(): WalletOption[] {
  const out: WalletOption[] = [];
  const seen = new Set<string>();
  for (const w of getWallets().get() as unknown as StdWallet[]) {
    const solana = w.chains.some((c) => c.startsWith('solana:'));
    const connect = w.features['standard:connect'] as ConnectFeature | undefined;
    const sign = w.features['solana:signMessage'] as SignFeature | undefined;
    if (!solana || !connect || !sign || seen.has(w.name)) continue;
    seen.add(w.name);
    out.push({
      name: w.name,
      icon: w.icon,
      connect: async () => {
        const { accounts } = await connect.connect();
        const account = accounts.find((a) => a.chains.some((c) => c.startsWith('solana:'))) ?? accounts[0];
        if (!account) throw new Error('err.wallet.noAccount');
        return {
          address: account.address,
          sign: async (message) => {
            const [r] = await sign.signMessage({ account, message: encode(message) });
            return bs58.encode(r.signature);
          },
        };
      },
    });
  }
  // Phantom antiguo (sin Wallet Standard)
  const legacy = (window as unknown as { phantom?: { solana?: LegacyProvider } }).phantom?.solana;
  if (legacy?.isPhantom && !seen.has('Phantom')) {
    out.push({
      name: 'Phantom',
      icon: '',
      connect: async () => {
        const r = await legacy.connect();
        return {
          address: r.publicKey.toString(),
          sign: async (message) => bs58.encode((await legacy.signMessage(encode(message), 'utf8')).signature),
        };
      },
    });
  }
  return out;
}

export const shortAddress = (a: string): string => `${a.slice(0, 4)}…${a.slice(-4)}`;
