import { InstanceBase, InstanceStatus, Regex } from '@companion-module/base'
import { UpgradeScripts } from './upgrades.js'
import { updateActions } from './actions.js'
import { updateFeedbacks } from './feedbacks.js'
import { updatePresets } from './presets.js'
import { updateVariableDefinitions, updateVariableValues } from './variables.js'

export { UpgradeScripts }

const POLL_INTERVAL_MS = 4000
const REQUEST_TIMEOUT_MS = 5000
/** How long the "Last action failed" feedback stays lit after a failed press. */
const FAILED_FEEDBACK_MS = 10000

/** Plain words for the network errors Node's fetch keeps in `cause`. */
const NETWORK_REASONS = {
	ENOTFOUND: 'host name not found',
	EAI_AGAIN: 'host name lookup failed (DNS)',
	ECONNREFUSED: 'connection refused',
	ECONNRESET: 'connection reset',
	EHOSTUNREACH: 'host unreachable',
	ENETUNREACH: 'network unreachable',
	ETIMEDOUT: 'connection timed out',
	UND_ERR_CONNECT_TIMEOUT: 'connection timed out',
	CERT_HAS_EXPIRED: 'TLS certificate has expired',
	DEPTH_ZERO_SELF_SIGNED_CERT: 'self-signed TLS certificate',
	SELF_SIGNED_CERT_IN_CHAIN: 'self-signed TLS certificate',
	UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'TLS certificate could not be verified',
	ERR_TLS_CERT_ALTNAME_INVALID: 'TLS certificate does not match the host name',
}

/**
 * A readable message for a failed request. Node's fetch reports every network failure as
 * "fetch failed" and keeps the real reason (ENOTFOUND, ECONNREFUSED, TLS…) in `cause`.
 */
export function describeError(e) {
	if (e?.name === 'TimeoutError') return `No answer from ShowSign within ${REQUEST_TIMEOUT_MS / 1000} s`
	const message = String(e?.message || e)
	const cause = e?.cause
	const code = cause?.code
	const reason = (code && NETWORK_REASONS[code]) || code || cause?.message
	if (!reason || message.includes(reason)) return message
	return `${message}: ${reason}${code && NETWORK_REASONS[code] ? ` (${code})` : ''}`
}

/**
 * ShowSign Signage — fire on-screen announcement cues to groups of ShowSign displays.
 *
 * Talks to the ShowSign automation API with an event-scoped automation key (Portal →
 * Event → Announcements → Automation keys). Polls /automation/context to keep the group and
 * cue dropdowns, presets and the live-state feedback in sync, and fires cues via
 * /automation/announce and /automation/clear.
 */
export default class ShowSignInstance extends InstanceBase {
	async init(config, _isFirstInit, secrets) {
		this.config = config
		this.secrets = secrets ?? {}
		this.context = { event: null, groups: [], cues: [], active: [] }
		this.definitionsKey = null
		this.lastError = null
		this.lastActionError = ''
		/** Failed presses per group: group id (or the value pressed) → when it failed. */
		this.failures = new Map()
		this.failedTimers = new Set()
		this.polling = false

		this.updateStatus(InstanceStatus.Connecting)
		this.defineAll(true)
		await this.poll()
		this.pollTimer = setInterval(() => void this.poll(), POLL_INTERVAL_MS)
	}

	async destroy() {
		if (this.pollTimer) clearInterval(this.pollTimer)
		this.pollTimer = undefined
		for (const t of this.failedTimers ?? []) clearTimeout(t)
		this.failedTimers?.clear()
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

	/** The key travels with every request, so only ever over https (plain http only to this machine, for testing). */
	urlProblem() {
		let u
		try {
			u = new URL(this.baseUrl())
		} catch {
			return 'The API base URL isn\'t a valid address'
		}
		if (u.protocol === 'https:') return null
		if (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) return null
		return 'The API base URL must start with https:// (the automation key must never travel unencrypted)'
	}

	async api(path, options = {}) {
		const problem = this.urlProblem()
		if (problem) throw new Error(problem)
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
			// ShowSign explains a refusal in the body ({"error": "..."}); show that, not just the status.
			const text = await res.text().catch(() => '')
			let detail = ''
			try {
				const body = JSON.parse(text)
				detail = typeof body?.error === 'string' ? body.error : typeof body?.message === 'string' ? body.message : ''
			} catch {
				detail = text.length <= 200 ? text.trim() : ''
			}
			const err = new Error(`${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`)
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
		const problem = this.urlProblem()
		if (problem) {
			this.setError(InstanceStatus.BadConfig, problem)
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
				this.setError(InstanceStatus.ConnectionFailure, describeError(e))
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

	/**
	 * The group/cue id for an option value. Dropdowns hand over the id; an expression may return
	 * the id or the name shown in ShowSign (any case).
	 */
	resolveId(list, value, nameKey) {
		const v = String(value ?? '').trim()
		if (!v) return null
		const byId = list.find((x) => String(x.id) === v)
		if (byId) return byId.id
		const lower = v.toLowerCase()
		const byName = list.find(
			(x) =>
				String(x[nameKey] ?? '')
					.trim()
					.toLowerCase() === lower,
		)
		return byName ? byName.id : null
	}

	resolveGroup(value) {
		return this.resolveId(this.context.groups, value, 'name')
	}

	resolveCue(value) {
		return this.resolveId(this.context.cues, value, 'label')
	}

	/** (Re)publish actions/feedbacks/presets/variables only when the set of groups or cues changes. */
	defineAll(force = false) {
		const key = JSON.stringify([this.groupChoices(), this.cueChoices()])
		if (!force && key === this.definitionsKey) return
		this.definitionsKey = key
		updateActions(this)
		updateFeedbacks(this)
		updatePresets(this)
		updateVariableDefinitions(this)
	}

	/** A press on this group worked: clear its failure (other groups keep theirs). */
	actionSucceeded(groupId) {
		const had = this.failures.delete(groupId)
		if (!had && !this.lastActionError) return
		this.lastActionError = ''
		updateVariableValues(this)
		this.checkFeedbacks('action_failed')
	}

	/** A press failed: log it, show it on the surface (variable + feedback), and flag a bad key. */
	actionFailed(what, e, groupId) {
		const message = e?.status ? String(e.message) : describeError(e)
		this.log('error', `${what} failed: ${message}`)
		this.lastActionError = `${what} failed: ${message}`
		this.failures.set(String(groupId ?? ''), Date.now())
		updateVariableValues(this)
		this.checkFeedbacks('action_failed')
		// Each failure has its own 10 s; re-check when this one runs out.
		const t = setTimeout(() => {
			this.failedTimers.delete(t)
			for (const [g, at] of this.failures) if (Date.now() - at >= FAILED_FEEDBACK_MS) this.failures.delete(g)
			this.checkFeedbacks('action_failed')
		}, FAILED_FEEDBACK_MS + 50)
		this.failedTimers.add(t)
		if (e?.status === 401 || e?.status === 403) {
			this.setError(InstanceStatus.BadConfig, 'Invalid or revoked automation key')
		}
	}

	/** A press failed in the last 10 s on this group (or on any group, when none is given). */
	actionFailedRecently(groupValue) {
		const fresh = (at) => at !== undefined && Date.now() - at < FAILED_FEEDBACK_MS
		if (!groupValue) return [...this.failures.values()].some(fresh)
		const key = this.resolveGroup(groupValue) ?? String(groupValue)
		return fresh(this.failures.get(key))
	}

	/**
	 * Why a group/cue lookup failed. Before ShowSign has answered once there are no groups or cues
	 * to look in, so the honest reason is the connection, not a missing group.
	 */
	lookupError(missing) {
		if (!this.context.event) {
			return new Error(`ShowSign not reached yet${this.lastError ? `: ${this.lastError}` : ''}`)
		}
		return new Error(`no ${missing} in this ShowSign event`)
	}

	async fireCue(groupValue, cueValue, ttlSeconds) {
		const groupId = this.resolveGroup(groupValue)
		const cueId = this.resolveCue(cueValue)
		if (!groupId || !cueId) {
			const missing = !groupId ? `group "${groupValue ?? ''}"` : `cue "${cueValue ?? ''}"`
			this.actionFailed('Fire', this.lookupError(missing), groupId ?? String(groupValue ?? ''))
			return
		}
		const body = { groupId, cueId }
		if (ttlSeconds > 0) body.ttlSeconds = ttlSeconds
		try {
			await this.api('/automation/announce', { method: 'POST', body: JSON.stringify(body) })
			this.actionSucceeded(groupId)
			await this.poll()
		} catch (e) {
			this.actionFailed('Fire', e, groupId)
		}
	}

	async clearGroup(groupValue) {
		const groupId = this.resolveGroup(groupValue)
		if (!groupId) {
			this.actionFailed('Clear', this.lookupError(`group "${groupValue ?? ''}"`), String(groupValue ?? ''))
			return
		}
		try {
			await this.api('/automation/clear', { method: 'POST', body: JSON.stringify({ groupId }) })
			this.actionSucceeded(groupId)
			await this.poll()
		} catch (e) {
			this.actionFailed('Clear', e, groupId)
		}
	}
}
