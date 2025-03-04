#! /bin/bash

# make a fake event
# $1 is the sequence number
echo "seq_num: $1"
# $2 is the type of event
echo "event_type: $2"
# $3 is the summary
echo "summary: $3"
# $4 is the destination directory
echo "destination directory: $4"

# stdin is the data of the event


# create a temporary file
temp_file=$(mktemp)

# read the data from stdin
cat > $temp_file
# use jq to get the meta data property called summary, if it doesn't exist, use empty string
summary=$(jq -r '.meta.summary // ""' $temp_file)

# create the file name <sequence number>-<summary>-event.json
file_name="${1}-${summary}-event.json"
echo "file_name: $file_name"
# move the temporary file to the file name
mv $temp_file $4/$file_name
