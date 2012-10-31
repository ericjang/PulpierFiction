function firstWords() {
	var words = [['Once','upon','a'],
	['It','was','a'],
	['Darkness','fell','upon'],
	['Long','ago,','in'],
	['I','wandered','into'],
	['The','sound','of'],
	['Last','night','I'],
	['Do','you','ever']
	['I','used','to'],
	['I','drank','the'],
	['I','went','to'],
	['Alice','was','murdered'],
	['Let\'s','drink','to'],
	['The','sun','shone'],
	['We','had','turkey'],
	['Dear','Diary','I'],
	['Why','can\'t','I'],
	['I','can\'t','stop'],
	['My','cat','ate'],
	['Do','you','like'],
	['I','injured','my'],
	['Call','me','Ishmael'],
	['The','Barbecue','was'],
	['I','got','married'],
	['I','lost','my'],
	['Edgar','Allan','Poe'],
	['I','rented','a'],
	['Joe','is','sick'],
	['Barack','Obama','just'],
	['We','kissed','under'],
	['The','Rwandan','Genocide'],
	['When','I','am'],
	['What','was','the'],
	['A','romantic','evening'],
	['What\'s','that','smell?'],
	['Grandma','makes','pancakes'],
	['He','said,','\"YOLO\"'],
	['A','tall','black']
	];
	
	return words[Math.floor(Math.random() * words.length)];
}

module.exports = firstWords;