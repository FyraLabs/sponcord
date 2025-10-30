import { env } from 'cloudflare:workers';
import { Webhooks, createWebMiddleware } from '@octokit/webhooks';
import { EmbedBuilder } from '@discordjs/builders';
import { TimestampStyles, time } from '@discordjs/formatters';

const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const githubWebhooks = new Webhooks({
	secret: env.GITHUB_WEBHOOK_SECRET,
});

githubWebhooks.on('sponsorship', async ({ payload }) => {
	const { tier, sponsor, privacy_level, created_at } = payload.sponsorship;
	const embed = new EmbedBuilder();

	switch (payload.action) {
		case 'created': {
			embed.setTitle('New Sponsor').setColor(0x00ff00);
			break;
		}
		case 'edited': {
			embed.setTitle('Sponsor Privacy Changed').setColor(0xffff00);

			const from = payload.changes.privacy_level?.from;
			if (from)
				embed.addFields({
					name: 'Previous Privacy Level',
					value: from === 'public' ? 'Public' : 'Private',
				});
			break;
		}
		case 'pending_cancellation': {
			embed.setTitle('Pending Sponsor Cancellation').setColor(0xffa500);
			if (payload.effective_date)
				embed.addFields({
					name: 'Effective Date',
					value: time(new Date(payload.effective_date), TimestampStyles.ShortDateTime),
				});
			break;
		}
		case 'cancelled': {
			embed.setTitle('Cancelled Sponsor').setColor(0xff0000);
			break;
		}
		case 'pending_tier_change': {
			embed.setTitle('Pending Sponsor Tier Change').setColor(0xffa500);
			if (payload.effective_date)
				embed.addFields({
					name: 'Effective Date',
					value: time(new Date(payload.effective_date), TimestampStyles.ShortDateTime),
				});

			const from = payload.changes.tier.from;
			if (from)
				embed.addFields({
					name: 'Previous Tier',
					value: `${from.name} (${formatPrice(from.monthly_price_in_cents)})`,
				});
			break;
		}
		case 'tier_changed': {
			embed.setTitle('Sponsor Tier Changed').setColor(0xffff00);

			const from = payload.changes.tier.from;
			if (from)
				embed.addFields({
					name: 'Previous Tier',
					value: `${from.name} (${formatPrice(from.monthly_price_in_cents)})`,
				});
			break;
		}
	}

	embed.addFields(
		{
			name: 'Tier',
			value: `${tier.name} (${formatPrice(tier.monthly_price_in_cents)})`,
		},
		{
			name: 'Privacy Level',
			value: privacy_level === 'public' ? 'Public' : 'Private',
		},
	);

	if (payload.action !== 'created') {
		embed.addFields({
			name: 'Sponsor Since',
			value: time(new Date(created_at), TimestampStyles.ShortDateTime),
		});
	}

	if (sponsor) {
		embed.setAuthor({
			name: sponsor.name ? `${sponsor.name} (@${sponsor.login})` : (sponsor.login ?? 'Unknown'),
			iconURL: sponsor.avatar_url,
			url: sponsor.html_url,
		});
	}

	const webhookRequest = await fetch(env.DISCORD_WEBHOOK_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			embeds: [embed],
		}),
	});

	if (!webhookRequest.ok) {
		throw new Error(`Failed to send Discord webhook: ${await webhookRequest.text()}`);
	}
});

const middleware = createWebMiddleware(githubWebhooks, { path: '/' });

export default {
	fetch: (request) => middleware(request),
} satisfies ExportedHandler<Env>;
