import { combineRgb } from '@companion-module/base'

const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)
const DARK = combineRgb(30, 30, 30)
const YELLOW = combineRgb(253, 199, 25)
const RED = combineRgb(200, 0, 0)

/** Preset ids: stable per group/cue, letters, numbers and underscores only. */
const safe = (id) => String(id).replace(/[^a-zA-Z0-9]/g, '_')

/**
 * Ready-made buttons: for every screen group, one button per cue (fires it, lights yellow while
 * the group shows it, red for a moment if ShowSign refused the press) and a Clear button.
 * Rebuilt whenever the event's groups or cues change.
 */
export function updatePresets(self) {
	const groups = self.context.groups
	const cues = self.context.cues
	const presets = {}
	const structure = []

	for (const g of groups) {
		const ids = []
		for (const c of cues) {
			const id = `fire_${safe(g.id)}_${safe(c.id)}`
			presets[id] = {
				type: 'simple',
				name: `Fire "${c.label}" on ${g.name}`,
				keywords: [g.name, c.label, 'fire', 'announcement'],
				style: { text: c.label, size: 'auto', color: WHITE, bgcolor: DARK },
				steps: [{ down: [{ actionId: 'fire', options: { group: g.id, cue: c.id, ttl: 0 } }], up: [] }],
				feedbacks: [
					{
						feedbackId: 'group_showing',
						options: { group: g.id, cue: c.id },
						style: { bgcolor: YELLOW, color: BLACK },
					},
					{ feedbackId: 'action_failed', options: { group: g.id }, style: { bgcolor: RED, color: WHITE } },
				],
			}
			ids.push(id)
		}
		const clearId = `clear_${safe(g.id)}`
		presets[clearId] = {
			type: 'simple',
			name: `Clear ${g.name}`,
			keywords: [g.name, 'clear'],
			style: { text: `Clear\\n${g.name}`, size: 'auto', color: WHITE, bgcolor: DARK },
			steps: [{ down: [{ actionId: 'clear', options: { group: g.id } }], up: [] }],
			feedbacks: [{ feedbackId: 'action_failed', options: { group: g.id }, style: { bgcolor: RED, color: WHITE } }],
		}
		ids.push(clearId)
		structure.push({
			id: `group_${safe(g.id)}`,
			name: g.name,
			description: `Fire a cue on ${g.name} or clear it. A button lights yellow while ${g.name} shows its cue.`,
			definitions: ids,
		})
	}

	self.setPresetDefinitions(structure, presets)
}
