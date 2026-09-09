variable "server_ip" {
  description = "The server's IP address"
  type        = string
}

variable "ssh_user" {
  description = "The SSH user to connect to the server"
  type        = string
}

variable "ssh_private_key" {
  description = "The SSH private key to connect to the server"
  type        = string
}

variable "ssh_port" {
  description = "The SSH port to connect to the server"
  type        = number
}
