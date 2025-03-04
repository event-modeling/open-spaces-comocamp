#! /bin/bash

# update the fake events
# $1 is the directory name

cd "$1" || exit 1

# Use find with a while loop to properly handle filenames with spaces
find . -name "*.json" -type f | sort | while read -r file; do
	#create a temp file
	temp_file=$(mktemp)
	echo "processing $file"
	# get the sequence number
	seq_num=$(basename "$file" | cut -d- -f1)
	echo "seq_num: $seq_num"
	# get the type of event
	event_type=$(basename "$file" | cut -d- -f2 | sed 's/_event$//')
	echo "event_type: $event_type"
	# get the summary, it's all the text after the second dash using -event.json at the end
	summary=$(basename "$file" | cut -d- -f3- | sed 's/event.json$//' | sed 's/_$//' | sed 's/-$//')
	echo "summary: $summary"
	
	# use jq to remove timestamp at root and type at root and make meta with the event type
	jq --arg event_type "$event_type" 'del(.timestamp) | .meta = { "type": $event_type } | del(.type)' "$file" > "$temp_file"
	echo "--------------------------------"
	newfilename="$seq_num-$event_type-$summary-event.json"
	echo "new filename: $newfilename"
	cat "$temp_file"
	echo "--------------------------------"

	rm "$file"
	mv "$temp_file" "$newfilename"
	#rm "$temp_file"
	
done
