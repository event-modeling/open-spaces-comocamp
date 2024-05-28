defmodule OpenSpacesComocampWeb.OpenSpaceController do
  use OpenSpacesComocampWeb, :controller

  def new(conn, _params) do
    render(conn, :new, id: UUID.uuid4())
  end
  def create(conn, %{"id" => id, "spaceName" => spaceName}) do
    IO.inspect(id, label: "ID")
    IO.inspect(spaceName, label: "Space Name")
    conn
    |> put_status(:ok)
    |> render("new_space.html", id: id, spaceName: spaceName)
  end
end
