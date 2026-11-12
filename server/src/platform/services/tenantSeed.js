import VipLevel from '../../models/VipLevel.js';
import StaticPage from '../../models/StaticPage.js';
import SystemMailTemplate from '../../models/SystemMailTemplate.js';
import SmsTemplate from '../../models/SmsTemplate.js';
import ChatRoom from '../../models/ChatRoom.js';
import RiskRule from '../../models/RiskRule.js';
import PlayerSegment from '../../models/PlayerSegment.js';
import Setting from '../../models/Setting.js';
import { runWithTenant } from '../../tenancy/context.js';

/**
 * Seed the essential, non-demo tenant records required before go-live.
 * Each collection is populated only when it has no records for this tenant so
 * retries do not replace operator configuration added after provisioning.
 *
 * @param {import('mongoose').Types.ObjectId|string} tenantId
 * @param {{ brandName?: string }} [options]
 * @returns {Promise<void>}
 */
export async function seedTenantSubset(tenantId, { brandName = '' } = {}) {
  return runWithTenant(tenantId, async () => {
    const displayName = brandName.trim() || 'this service';

    const existingVip = await VipLevel.countDocuments({ tenantId });
    if (existingVip === 0) {
      await VipLevel.insertMany([
        { tenantId, level: 1, name: 'Bronze', xpRequired: 0, cashbackPercent: 0, icon: 'military_tech' },
        { tenantId, level: 2, name: 'Silver', xpRequired: 1000, cashbackPercent: 2, icon: 'workspace_premium' },
        { tenantId, level: 3, name: 'Gold', xpRequired: 5000, cashbackPercent: 5, icon: 'star' },
        { tenantId, level: 4, name: 'Platinum', xpRequired: 20000, cashbackPercent: 8, icon: 'auto_awesome' },
      ]);
    }

    const existingPages = await StaticPage.countDocuments({ tenantId });
    if (existingPages === 0) {
      await StaticPage.insertMany([
        {
          tenantId,
          slug: 'about-us',
          category: 'company',
          route: '/about',
          title: 'About Us',
          intro: `Learn about ${displayName}.`,
          sections: [{ title: 'About', content: [`${displayName} is operated according to its published policies.`] }],
          footerColumn: 'brand',
          footerOrder: 1,
        },
        {
          tenantId,
          slug: 'terms-and-conditions',
          category: 'legal',
          route: '/legal/terms',
          title: 'Terms and Conditions',
          intro: 'General terms and conditions.',
          sections: [{ title: 'Terms', content: ['Please review these terms before using the service.'] }],
          footerColumn: 'legal',
          footerOrder: 1,
        },
        {
          tenantId,
          slug: 'privacy-policy',
          category: 'legal',
          route: '/legal/privacy',
          title: 'Privacy Policy',
          intro: 'Privacy and data security information.',
          sections: [{ title: 'Privacy', content: ['Personal data is handled according to the privacy policy.'] }],
          footerColumn: 'legal',
          footerOrder: 2,
        },
        {
          tenantId,
          slug: 'responsible-gaming',
          category: 'legal',
          route: '/legal/responsible-gaming',
          title: 'Responsible Gaming',
          intro: 'Information about responsible participation.',
          sections: [{ title: 'Responsible participation', content: ['Use the service responsibly.'] }],
          footerColumn: 'legal',
          footerOrder: 3,
        },
      ]);
    }

    const existingMail = await SystemMailTemplate.countDocuments({ tenantId });
    if (existingMail === 0) {
      await SystemMailTemplate.insertMany([
        {
          tenantId,
          event: 'user.welcome',
          category: 'action',
          name: 'Welcome',
          subject: `Welcome to ${displayName}`,
          body: '<p>Welcome, {{username}}.</p>',
          isSystem: true,
        },
        {
          tenantId,
          event: 'user.passwordReset',
          category: 'action',
          name: 'Password reset',
          subject: 'Password reset request',
          body: '<p>Reset your password using {{resetUrl}}.</p>',
          isSystem: true,
        },
      ]);
    }

    const existingSms = await SmsTemplate.countDocuments({ tenantId });
    if (existingSms === 0) {
      await SmsTemplate.insertMany([
        {
          tenantId,
          key: 'welcomeMessage',
          title: 'Welcome',
          type: 'action',
          eventKey: 'user.welcome',
          content: 'Welcome, {{username}}.',
        },
      ]);
    }

    const existingRoom = await ChatRoom.countDocuments({ tenantId });
    if (existingRoom === 0) {
      await ChatRoom.create({ tenantId, name: 'General', slug: 'general', isActive: true, isPublic: true });
    }

    const existingRules = await RiskRule.countDocuments({ tenantId });
    if (existingRules === 0) {
      await RiskRule.insertMany([
        {
          tenantId,
          name: 'Rapid withdrawals',
          description: 'Review withdrawals requested soon after a deposit.',
          category: 'withdrawal',
          conditions: [{ field: 'minutesSinceDeposit', operator: 'lt', value: 15 }],
          action: 'REVIEW',
          severity: 'MEDIUM',
          reasonCode: 'RAPID_WITHDRAWAL',
        },
        {
          tenantId,
          name: 'Multiple accounts from one IP',
          description: 'Review when many accounts use the same IP address.',
          category: 'device',
          conditions: [{ field: 'accountsSameIp', operator: 'gt', value: 3 }],
          action: 'REVIEW',
          severity: 'HIGH',
          reasonCode: 'MULTIPLE_ACCOUNT_IP',
        },
      ]);
    }

    const existingSegments = await PlayerSegment.countDocuments({ tenantId });
    if (existingSegments === 0) {
      await PlayerSegment.insertMany([
        { tenantId, name: 'All Players', slug: 'all-players' },
        { tenantId, name: 'VIP Players', slug: 'vip-players', criteria: { vipLevel: { min: 1 } } },
      ]);
    }

    await Setting.findOneAndUpdate(
      { tenantId, scope: 'tenant', key: 'site_active' },
      { $setOnInsert: { tenantId, scope: 'tenant', key: 'site_active', value: 'true' } },
      { upsert: true, setDefaultsOnInsert: true },
    );
  });
}
