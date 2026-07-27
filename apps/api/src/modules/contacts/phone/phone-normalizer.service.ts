import { HttpStatus, Injectable } from '@nestjs/common';
import { CountryCode, isSupportedCountry, parsePhoneNumberFromString } from 'libphonenumber-js';

import { CONTACT_ERROR_CODES, contactException } from '../contacts.errors';

export interface NormalizedPhone {
  phone: string;
  phoneNormalized: string;
}

@Injectable()
export class PhoneNormalizerService {
  normalize(
    phone: string | null | undefined,
    country: string | null | undefined,
  ): NormalizedPhone | null {
    if (phone === null || phone === undefined || phone.trim().length === 0) {
      return null;
    }

    const visiblePhone = phone.trim();
    const normalizedCountry = this.normalizeCountry(country);
    const parsed = parsePhoneNumberFromString(
      visiblePhone,
      visiblePhone.startsWith('+') ? undefined : (normalizedCountry ?? undefined),
    );

    if (!parsed || !parsed.isValid()) {
      throw contactException(
        HttpStatus.BAD_REQUEST,
        CONTACT_ERROR_CODES.INVALID_PHONE,
        'El número telefónico no es válido.',
      );
    }

    return {
      phone: visiblePhone,
      phoneNormalized: parsed.number,
    };
  }

  normalizeCountry(country: string | null | undefined): CountryCode | null {
    if (country === null || country === undefined || country.trim().length === 0) {
      return null;
    }

    const normalizedCountry = country.trim().toUpperCase();
    if (
      !/^[A-Z]{2}$/.test(normalizedCountry) ||
      !isSupportedCountry(normalizedCountry as CountryCode)
    ) {
      throw contactException(
        HttpStatus.BAD_REQUEST,
        CONTACT_ERROR_CODES.INVALID_COUNTRY,
        'El país debe ser un código ISO 3166-1 alpha-2 válido.',
      );
    }
    return normalizedCountry as CountryCode;
  }
}
