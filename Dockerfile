FROM node:16.6-alpine AS builder
WORKDIR /src
COPY ./package.json .
RUN npm install
FROM ubuntu:20.04
ARG DEBIAN_FRONTEND=noninteractive
#install ansible
RUN apt-get update && \
  apt-get install -y gcc python-dev libkrb5-dev && \
  apt-get install python3-pip -y && \
  pip3 install --upgrade pip && \
  pip3 install jmespath && \
  apt-get install -y sshpass && \
  apt-get install -y openssh-client && \
  pip3 install --upgrade virtualenv && pip3 install ansible
  #--user ansible
#install nodejs
RUN apt-get install -y curl && \
    apt-get install -y software-properties-common && \
#   curl -sL https://deb.nodesource.com/setup_14.x | bash - && \
    apt-get install -y nodejs 
#ansible-hostfile
RUN mkdir -p /etc/ansible && \
    echo '[cpe:vars]' > /etc/ansible/hosts && \
    echo 'ansible_ssh_private_key_file=../cpe_ssh_keys/defaulthostkey' > /etc/ansible/hosts && \
    echo '[cpe]' > /etc/ansible/hosts
#app
WORKDIR /app
EXPOSE 5001
EXPOSE 22
COPY --from=builder /src/node_modules/ /app/node_modules/
COPY ./manage-inform.js .
CMD ["node", "manage-inform.js"]