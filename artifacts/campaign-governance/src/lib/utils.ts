import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatMinorUnitsToCurrency(minorUnitsStr: string): string {
  if (!minorUnitsStr) return "0.00";
  try {
    const isNegative = minorUnitsStr.startsWith('-');
    const digits = minorUnitsStr.replace(/\D/g, '');
    if (digits === '') return "0.00";
    
    // Add leading zeros if needed so we have at least 3 digits (e.g., "5" -> "005" -> "0.05")
    const padded = digits.padStart(3, '0');
    
    const integerPart = padded.slice(0, -2);
    const fractionalPart = padded.slice(-2);
    
    // Add commas to integer part
    const formattedInteger = BigInt(integerPart).toLocaleString('en-US');
    
    return `${isNegative ? '-' : ''}${formattedInteger}.${fractionalPart}`;
  } catch (e) {
    return "0.00";
  }
}

export function parseDecimalToMinorUnits(decimalStr: string): string {
  if (!decimalStr) return "0";
  try {
    const isNegative = decimalStr.startsWith('-');
    const cleanStr = decimalStr.replace(/[^\d.]/g, '');
    if (cleanStr === '') return "0";
    
    let integerPart = "0";
    let fractionalPart = "00";
    
    if (cleanStr.includes('.')) {
      const parts = cleanStr.split('.');
      integerPart = parts[0] || "0";
      fractionalPart = (parts[1] || "") + "00";
      fractionalPart = fractionalPart.slice(0, 2);
    } else {
      integerPart = cleanStr;
    }
    
    // Using BigInt to avoid floating point precision issues
    const minorUnits = (BigInt(integerPart) * 100n) + BigInt(fractionalPart);
    return `${isNegative ? '-' : ''}${minorUnits.toString()}`;
  } catch (e) {
    return "0";
  }
}

export function sumMinorUnits(...values: (string | undefined | null)[]): string {
  try {
    const total = values.reduce((acc: bigint, val) => {
      if (!val) return acc;
      const isNegative = val.startsWith('-');
      const digits = val.replace(/\D/g, '');
      if (digits === '') return acc;
      const bigIntVal = BigInt(digits);
      return isNegative ? acc - bigIntVal : acc + bigIntVal;
    }, 0n);
    return total.toString();
  } catch (e) {
    return "0";
  }
}

export function subtractMinorUnits(a: string | undefined | null, b: string | undefined | null): string {
  try {
    const getBigInt = (val: string | undefined | null) => {
      if (!val) return 0n;
      const isNegative = val.startsWith('-');
      const digits = val.replace(/\D/g, '');
      if (digits === '') return 0n;
      return isNegative ? -BigInt(digits) : BigInt(digits);
    };
    return (getBigInt(a) - getBigInt(b)).toString();
  } catch (e) {
    return "0";
  }
}
