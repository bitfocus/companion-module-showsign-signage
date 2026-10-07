import { InstanceBase, InstanceStatus, Regex } from '@companion-module/base'
import { UpgradeScripts } from './upgrades.js'
import { updateActions } from './actions.js'
import { updateFeedbacks } from './feedbacks.js'
import { updateVariableDefinitions, updateVariableValues } from './variables.js'

export { UpgradeScripts }

const POLL_INTERVAL_MS = 4000
const REQUEST_TIMEOUT_MS = 5000

/**
 * ShowSign Signage — fire on-screen announcement cues to groups of ShowSign displays.
 *
 * Talks to the ShowSign automation API with an event-scoped automation key (Portal →
 * Event → Announcements → Automation keys). Polls /automation/context to keep the group and
 * cue dropdowns and the live-state feedback in sync, and fires cues via /automation/announce
 * and /automation/clear.
 */
export default class ShowSignInstance extends InstanceBase {
	async init(config, _isFirstInit, secrets) {
		this.config = config
		this.secrets = secrets ?? {}
		this.context = { event: null, groups: [], cues: [], active: [] }
		this.definitionsKey = null
		this.lastError = null
		this.polling = false

		this.updateStatus(InstanceStatus.Connecting)
		this.defineAll(true)
		await this.poll()
		this.pollTimer = setInterval(() => void this.poll(), POLL_INTERVAL_MS)
	}

	async destroy() {
		if (this.pollTimer) clearInterval(this.pollTimer)
		this.pollTimer = undefined
	}

	async configUpdated(config, secrets) {
		this.config = config
		this.secrets = secrets ?? {}
		this.lastError = null
		await this.poll()
	}

	getConfigFields() {
		return [
			{
				type: 'static-text',
				id: 'info',
				width: 12,
				label: 'ShowSign',
				value:
					'Fire announcement cues to screen groups. Create an automation key in the ShowSign portal (Event → Announcements → Automation keys) and paste it below.',
			},
			{
				type: 'textinput',
				id: 'url',
				label: 'ShowSign API base URL',
				width: 12,
				default: 'https://portal.showsign.io/api',
				regex: Regex.SOMETHING,
			},
			{
				type: 'secret-text',
				id: 'apikey',
				label: 'Automation key',
				width: 12,
				default: '',
				regex: '/^ssk_[0-9a-f]+$/',
			},
		]
	}

	baseUrl() {
		return (this.config?.url || '').trim().replace(/\/+$/, '')
	}

	apiKey() {
		return (this.secrets?.apikey || '').trim()
	}

	async api(path, options = {}) {
		const res = await fetch(`${this.baseUrl()}${path}`, {
			...options,
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.apiKey()}`,
				...(options.headers || {}),
			},
		})
		if (!res.ok) {
			const err = new Error(`${res.status} ${res.statusText}`)
			err.status = res.status
			throw err
		}
		return res.json()
	}

	setError(status, message) {
		this.updateStatus(status, message)
		if (this.lastError !== message) {
			this.log('warn', message)
			this.lastError = message
		}
	}

	async poll() {
		if (!this.baseUrl() || !this.apiKey()) {
			this.setError(InstanceStatus.BadConfig, 'Set the API base URL and automation key')
			return
		}
		if (this.polling) return // previous poll still in flight
		this.polling = true
		try {
			const ctx = await this.api('/automation/context')
			this.context = {
				event: ctx.event || null,
				groups: Array.isArray(ctx.groups) ? ctx.groups : [],
				cues: Array.isArray(ctx.cues) ? ctx.cues : [],
				active: Array.isArray(ctx.active) ? ctx.active : [],
			}
			this.updateStatus(InstanceStatus.Ok, this.context.event?.name ?? null)
			if (this.lastError) this.log('info', 'Connected to ShowSign')
			this.lastError = null
			this.defineAll()
			updateVariableValues(this)
			this.checkFeedbacks('group_showing')
		} catch (e) {
			if (e.status === 401 || e.status === 403) {
				this.setError(InstanceStatus.BadConfig, 'Invalid or revoked automation key')
			} else {
				this.setError(InstanceStatus.ConnectionFailure, String(e.message || e))
			}
		} finally {
			this.polling = false
		}
	}

	groupChoices() {
		return this.context.groups.map((g) => ({ id: g.id, label: g.name }))
	}

	cueChoices() {
		return this.context.cues.map((c) => ({ id: c.id, label: c.label }))
	}

	/** (Re)publish actions/feedbacks/variables only when the set of groups or cues changes. */
	defineAll(force = false) {
		const key = JSON.stringify([this.groupChoices(), this.cueChoices()])
		if (!force && key === this.definitionsKey) return
		this.definitionsKey = key
		updateActions(this)
		updateFeedbacks(this)
		updateVariableDefinitions(this)
	}

	async fireCue(groupId, cueId, ttlSeconds) {
		const body = { groupId, cueId }
		if (ttlSeconds > 0) body.ttlSeconds = ttlSeconds
		try {
			await this.api('/automation/announce', { method: 'POST', body: JSON.stringify(body) })
			await this.poll()
		} catch (e) {
			this.log('error', `Fire failed: ${e.message || e}`)
		}
	}

	async clearGroup(groupId) {
		try {
			await this.api('/automation/clear', { method: 'POST', body: JSON.stringify({ groupId }) })
			await this.poll()
		} catch (e) {
			this.log('error', `Clear failed: ${e.message || e}`)
		}
	}
}
