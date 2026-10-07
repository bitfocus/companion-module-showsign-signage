import { combineRgb } from '@companion-module/base'

export function updateFeedbacks(self) {
	const groups = self.groupChoices()
	const cues = self.cueChoices()

	self.setFeedbackDefinitions({
		group_showing: {
			type: 'boolean',
			name: 'Group is showing cue',
			description: 'Lights the button while the chosen group is currently showing the chosen cue.',
			defaultStyle: { bgcolor: combineRgb(253, 199, 25), color: combineRgb(0, 0, 0) },
			options: [
				{ type: 'dropdown', id: 'group', label: 'Group', choices: groups, default: groups[0]?.id ?? '' },
				{ type: 'dropdown', id: 'cue', label: 'Cue', choices: cues, default: cues[0]?.id ?? '' },
			],
			callback: ({ options }) => {
				const live = self.context.active.find((a) => a.groupId === options.group)
				return Boolean(live && live.cueId === options.cue)
			},
		},
	})
}
