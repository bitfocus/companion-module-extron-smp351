export function getVariables() {
	const variables = []

	variables.push({
		name: 'Current recording status',
		variableId: 'recordStatus',
	})

	variables.push({
		name: 'Time remaining on recording hh:mm:ss',
		variableId: 'timeRemain',
	})

	variables.push({
		name: 'Current recording title',
		variableId: 'recordingTitle',
	})

	return variables
}
