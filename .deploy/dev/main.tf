resource "null_resource" "deploy_application" {
  connection {
    type        = "ssh"
    host        = var.server_ip
    user        = var.ssh_user
    private_key = var.ssh_private_key
    port        = var.ssh_port
  }

  provisioner "file" {
    source      = "${path.module}/docker-compose.yml"
    destination = "/home/${var.ssh_user}/docker-compose.yml"
  }

  provisioner "remote-exec" {
    inline = [
      "cd /home/${var.ssh_user}/docker-compose.yml",
      "docker compose down",
      "docker compose up -d --build",
      "docker image prune -f"
    ]
  }
}

output "server_ip" {
  value = var.server_ip
}
