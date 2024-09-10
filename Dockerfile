FROM ruby:3.0-alpine3.12

RUN mkdir /app
WORKDIR /app

# add statically required base components
RUN apk --no-cache add bash

# copy initial application dependencies
ADD ruby/Gemfile ruby/Gemfile.lock /app/ruby/

# pre-install initial application requirements
RUN pwd
RUN ls -la
RUN cd ruby && gem install bundler && \
  bundle install --jobs=8

# copy the application directory
ADD . /app

CMD cd ruby && ruby app.rb
EXPOSE 4567
