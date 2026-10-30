import { combineRgb } from '@companion-module/base'
import { cueOption, groupOption } from './actions.js'

export function updateFeedbacks(self) {
	const groups = self.groupChoices()
	const cues = self.cueChoices()

	self.setFeedbackDefinitions({
		group_showing: {
			type: 'boolean',
			name: 'Group is showing cue',
			description: 'Lights the button while the chosen group is currently showing the chosen cue.',
			defaultStyle: { bgcolor: combineRgb(253, 199, 25), color: combineRgb(0, 0, 0) },
			options: [groupOption(groups), cueOption(cues)],
			callback: ({ options }) => {
				const groupId = self.resolveGroup(options.group)
				const cueId = self.resolveCue(options.cue)
				if (!groupId || !cueId) return false
				const live = self.context.active.find((a) => a.groupId === groupId)
				return Boolean(live && live.cueId === cueId)
			},
		},
		action_failed: {
			type: 'boolean',
			name: 'Last action failed',
			description:
				'Lights the button for 10 seconds after a Fire or Clear press that ShowSign refused or could not receive (the reason is in the last_action_error variable and the log).',
			defaultStyle: { bgcolor: combineRgb(200, 0, 0), color: combineRgb(255, 255, 255) },
			options: [
				{
					...groupOption([{ id: '', label: 'Any group' }, ...groups]),
					label: 'For presses on',
					default: '',
				},
			],
			callback: ({ options }) => self.actionFailedRecently(options.group),
		},
	})
}
