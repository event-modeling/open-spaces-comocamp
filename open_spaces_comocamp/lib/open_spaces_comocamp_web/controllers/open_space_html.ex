defmodule OpenSpacesComocampWeb.OpenSpaceHtml do
  use OpenSpacesComocampWeb, :html

  def new(assigns) do
    ~H"""
    <h1>New Space</h1>
    <form action="/new" method="POST">
      <input type="text" id="spaceName" name="spaceName" required>
      <input type="hidden" id="id" name="id" value={@id}>
      <button type="submit">Create</button>
    </form>
    """
  end
end
