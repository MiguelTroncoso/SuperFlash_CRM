import { Injectable } from '@nestjs/common';
import { COUNTRIES } from '@superflash/utils';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';

@Injectable()
export class CountriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * List all countries for organization, merged with standard 20 ISO countries catalogue.
   */
  async list(organizationId: string) {
    const customConfigs = await this.prisma.countryConfig.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    });

    const configMap = new Map(customConfigs.map((c) => [c.countryCode, c]));

    return COUNTRIES.map((country, index) => {
      const config = configMap.get(country.code);
      return {
        code: country.code,
        name: country.name,
        dialCode: country.dialCode,
        flag: country.flag,
        active: config ? config.active : true,
        sortOrder: config ? config.sortOrder : index,
      };
    }).sort((a, b) => (a.active === b.active ? a.sortOrder - b.sortOrder : a.active ? -1 : 1));
  }

  /**
   * Update country activation status for an organization.
   */
  async updateStatus(
    countryCode: string,
    active: boolean,
    user: AuthenticatedUser,
    metadata?: { ipAddress?: string; requestId?: string },
  ) {
    const code = countryCode.trim().toUpperCase();
    const standard = COUNTRIES.find((c) => c.code === code);
    if (!standard) {
      throw new Error(`País con código ${code} no encontrado en el catálogo.`);
    }

    const record = await this.prisma.countryConfig.upsert({
      where: {
        organizationId_countryCode: {
          organizationId: user.organizationId,
          countryCode: code,
        },
      },
      update: {
        active,
        deletedAt: null,
      },
      create: {
        organizationId: user.organizationId,
        countryCode: code,
        name: standard.name,
        dialCode: standard.dialCode,
        flag: standard.flag,
        active,
      },
    });

    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'COUNTRY_CONFIG_UPDATED',
      tableName: 'CountryConfig',
      recordId: record.id,
      newValue: { countryCode: code, active },
      ip: metadata?.ipAddress,
      requestId: metadata?.requestId,
    });

    return {
      code: record.countryCode,
      name: record.name,
      dialCode: record.dialCode,
      flag: record.flag,
      active: record.active,
    };
  }
}
